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
  /** 侧边栏：显示在标题与 MOC ID 之下、标签之上（无已存零件表时为 null 则不显示） */
  partTotalQty?: number | null;
};

type OptimisticProfile = { displayName: string; tags: string[] };

export function MocProfileForm({
  mocId,
  initialDisplayName,
  initialTags,
  variant = "default",
  partTotalQty = null,
}: Props) {
  const router = useRouter();
  const formTitleId = useId();
  const tagInputId = useId();
  const [editing, setEditing] = useState(false);
  const [optimistic, setOptimistic] = useState<OptimisticProfile | null>(null);
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
  const optimisticTagsKey = optimistic?.tags.join("\u0001") ?? "";

  useEffect(() => {
    if (!optimistic) return;
    const match =
      optimistic.displayName.trim() === initialDisplayName.trim() &&
      optimisticTagsKey === tagsSyncKey;
    if (match) setOptimistic(null);
  }, [initialDisplayName, optimistic, optimisticTagsKey, tagsSyncKey]);

  const viewDisplayName = optimistic?.displayName ?? initialDisplayName;
  const viewTags = optimistic?.tags ?? initialTags;
  const viewTitle = viewDisplayName.trim() || `MOC ${mocId}`;

  const enterEdit = useCallback(() => {
    const baseName = (optimistic?.displayName ?? initialDisplayName).slice(0, MOC_PROFILE_MAX_DISPLAY_NAME);
    setDisplayName(baseName);
    setTags([...(optimistic?.tags ?? initialTags)]);
    setTagDraft("");
    setError(null);
    setMessage(null);
    setEditing(true);
  }, [initialDisplayName, initialTags, optimistic]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
    setMessage(null);
    setTagDraft("");
  }, []);

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
        setOptimistic({ displayName, tags: [...tags] });
        setMessage("已保存。");
        setEditing(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }, [displayName, mocId, router, tags]);

  const readOnlyBlock = (
    <div className={isSidebar ? "space-y-3" : "mt-4 space-y-3"}>
      <div>
        <p
          id={isSidebar ? formTitleId : undefined}
          className={
            isSidebar
              ? "text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl"
              : "text-lg font-semibold text-[var(--text)]"
          }
        >
          {viewTitle}
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-[var(--muted)]">
          <span>MOC ID · {mocId}</span>
          {isSidebar && partTotalQty !== null ? (
            <>
              <span className="select-none text-[var(--muted-2)]" aria-hidden>
                ·
              </span>
              <span>
                零件总数 <span className="tabular-nums">{partTotalQty.toLocaleString("zh-CN")}</span>
              </span>
            </>
          ) : null}
        </p>
        {!isSidebar ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            显示名称仅用于本应用列表与标题；MOC ID（<span className="font-mono">{mocId}</span>）不变。
          </p>
        ) : null}
      </div>

      <div>
        <p className="text-xs text-[var(--muted)]">
          标签（<span className="tabular-nums">{viewTags.length}</span> / {MOC_PROFILE_MAX_TAGS}）
        </p>
        {viewTags.length === 0 ? (
          <p className="mt-1.5 text-xs text-[var(--muted-2)]">暂无标签</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {viewTags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-px text-[11px] text-[var(--text)]"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-3)] sm:text-sm"
          onClick={enterEdit}
        >
          编辑
        </button>
        {message ? (
          <span className="text-xs text-emerald-200/95" role="status">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );

  const editFields = (
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
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-[var(--muted)]">
          <span>MOC ID · {mocId}</span>
          {isSidebar && partTotalQty !== null ? (
            <>
              <span className="select-none text-[var(--muted-2)]" aria-hidden>
                ·
              </span>
              <span>
                零件总数 <span className="tabular-nums">{partTotalQty.toLocaleString("zh-CN")}</span>
              </span>
            </>
          ) : null}
        </p>
        {!isSidebar ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            显示名称仅用于本应用列表与标题；MOC ID（<span className="font-mono">{mocId}</span>）不变。
          </p>
        ) : null}
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
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] sm:text-sm"
          disabled={pending}
          onClick={cancelEdit}
        >
          取消
        </button>
        {error ? (
          <span className="text-xs text-red-200/95" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (isSidebar) {
    return <div className="min-w-0">{editing ? editFields : readOnlyBlock}</div>;
  }

  return (
    <section
      className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-2)] p-4"
      aria-labelledby={formTitleId}
    >
      <h2 id={formTitleId} className="text-sm font-semibold text-[var(--text)]">
        名称与标签
      </h2>
      {editing ? editFields : readOnlyBlock}
    </section>
  );
}
