"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

import { saveMocProfileAction } from "@/app/mocs/moc-profile-actions";
import {
  MOC_PROFILE_MAX_DISPLAY_NAME,
  MOC_PROFILE_MAX_TAG_LEN,
  MOC_PROFILE_MAX_TAGS,
} from "@/lib/moc-profile-parse";

type Props = {
  mocId: string;
  initialDisplayName: string;
  initialTags: string[];
  /** `sidebar`：与轮播并排时的紧凑形态（无外层大卡片） */
  variant?: "default" | "sidebar";
};

export function MocProfileForm({
  mocId,
  initialDisplayName,
  initialTags,
  variant = "default",
}: Props) {
  const router = useRouter();
  const formTitleId = useId();
  const tagInputId = useId();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [tags, setTags] = useState<string[]>(() => [...initialTags]);
  const [tagDraft, setTagDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tagsRef = useRef(tags);
  tagsRef.current = tags;

  const isSidebar = variant === "sidebar";

  const tagsSyncKey = initialTags.join("\u0001");
  useEffect(() => {
    setDisplayName(initialDisplayName);
    setTags([...initialTags]);
  }, [initialDisplayName, tagsSyncKey]);

  const addTag = useCallback(() => {
    const t = tagDraft.trim();
    setError(null);
    if (!t) return;
    if (t.length > MOC_PROFILE_MAX_TAG_LEN) {
      setError(`单个标签不超过 ${MOC_PROFILE_MAX_TAG_LEN} 字。`);
      return;
    }
    const prev = tagsRef.current;
    if (prev.length >= MOC_PROFILE_MAX_TAGS) {
      setError(`最多 ${MOC_PROFILE_MAX_TAGS} 个标签。`);
      return;
    }
    const lower = t.toLowerCase();
    if (prev.some((x) => x.toLowerCase() === lower)) return;
    setTags([...prev, t]);
    setTagDraft("");
  }, [tagDraft]);

  const removeTag = useCallback((idx: number) => {
    setTags((prev) => prev.filter((_, i) => i !== idx));
    setError(null);
  }, []);

  const onSave = useCallback(() => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const r = await saveMocProfileAction({ mocId, displayName, tags });
      if (r.ok) {
        setMessage("已保存。");
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }, [displayName, mocId, router, tags]);

  const fields = (
    <div className={isSidebar ? "space-y-3" : "mt-4 space-y-3"}>
      <div>
        <label className={isSidebar ? "block" : "block text-xs text-[var(--muted)]"}>
          {isSidebar ? <span className="sr-only">显示名称</span> : "显示名称"}
          <input
            id={isSidebar ? formTitleId : undefined}
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value.slice(0, MOC_PROFILE_MAX_DISPLAY_NAME));
              setError(null);
            }}
            maxLength={MOC_PROFILE_MAX_DISPLAY_NAME}
            placeholder={`MOC ${mocId}`}
            aria-label="显示名称"
            className={
              isSidebar
                ? "field mt-0 w-full border-0 border-b border-[var(--border-soft)] bg-transparent px-0 py-1.5 text-xl font-extrabold tracking-tight text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-0 sm:text-2xl"
                : "field mt-1 w-full max-w-md text-sm text-[var(--text)]"
            }
          />
        </label>
        <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">MOC ID · {mocId}</p>
        {!isSidebar ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            显示名称仅用于本应用列表与标题；MOC ID（<span className="font-mono">{mocId}</span>）不变。
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-[var(--muted)]">留空时标题与列表中显示为「MOC {mocId}」。</p>
        )}
      </div>

      <div>
        <p className="text-xs text-[var(--muted)]">
          标签（<span className="tabular-nums">{tags.length}</span> / {MOC_PROFILE_MAX_TAGS}）
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="inline-flex items-center gap-0.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-px text-[11px] text-[var(--text)]"
            >
              {t}
              <button
                type="button"
                className="rounded border-0 bg-transparent p-0 px-0.5 text-[var(--muted)] hover:text-red-200/95"
                aria-label={`移除标签 ${t}`}
                disabled={pending}
                onClick={() => removeTag(i)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id={tagInputId}
            type="text"
            value={tagDraft}
            maxLength={MOC_PROFILE_MAX_TAG_LEN}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="新标签，回车添加"
            className="field min-w-0 flex-1 text-xs text-[var(--text)] sm:text-sm"
          />
          <button
            type="button"
            className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--surface-3)] sm:px-3 sm:text-sm"
            disabled={pending}
            onClick={addTag}
          >
            添加
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="button-primary text-xs sm:text-sm" disabled={pending} onClick={onSave}>
          {pending ? "保存中…" : "保存名称与标签"}
        </button>
        {message ? (
          <span className="text-xs text-emerald-200/95" role="status">
            {message}
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-red-200/95" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (isSidebar) {
    return <div className="min-w-0">{fields}</div>;
  }

  return (
    <section
      className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4"
      aria-labelledby={formTitleId}
    >
      <h2 id={formTitleId} className="text-sm font-semibold text-[var(--text)]">
        名称与标签
      </h2>
      {fields}
    </section>
  );
}
