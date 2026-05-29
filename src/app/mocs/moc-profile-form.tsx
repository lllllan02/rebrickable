"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";

import { saveBuildProfileAction } from "@/app/mocs/moc-profile-actions";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";
import { mocListHref } from "@/lib/moc-list-href";
import {
  MOC_PROFILE_MAX_DISPLAY_NAME,
  MOC_PROFILE_MAX_TAG_LEN,
  MOC_PROFILE_MAX_TAGS,
} from "@/lib/moc-profile-parse";
import type { SetDetailOfficialMeta } from "@/lib/set-detail-official-meta";

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  initialDisplayName: string;
  initialTags: string[];
  initialPremium?: boolean;
  /** `sidebar`：与轮播并排时的紧凑形态（无外层大卡片） */
  variant?: "default" | "sidebar";
  /** 侧边栏：显示在标题与主体 ID 之下、标签之上（无已存零件表时为 null 则不显示） */
  partTotalQty?: number | null;
  /** 侧边栏：高砖整单参考价（元），来自接口根字段 `gdsPrice`，显示在主标题旁；未对照时为 null */
  gobricksGdsPriceCny?: number | null;
  /** 侧边栏：与主标题同一行右侧（如拥有 / 收藏按钮） */
  sidebarTitleAside?: ReactNode;
  /** 套装详情：并入标题与元数据行，不再单独展示「官方元数据」区块 */
  setOfficial?: SetDetailOfficialMeta;
  /** 已存零件表粒数（与官方库存总数不同时展示） */
  savedSheetPartTotalQty?: number | null;
};

type OptimisticProfile = { displayName: string; tags: string[]; isPremium: boolean };

export function MocProfileForm({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  initialDisplayName,
  initialTags,
  initialPremium = false,
  variant = "default",
  partTotalQty = null,
  gobricksGdsPriceCny = null,
  sidebarTitleAside = null,
  setOfficial = undefined,
  savedSheetPartTotalQty = null,
}: Props) {
  const ui = buildSubjectUi(subjectKind);
  const router = useRouter();
  const formTitleId = useId();
  const tagInputId = useId();
  const [editing, setEditing] = useState(false);
  const [optimistic, setOptimistic] = useState<OptimisticProfile | null>(null);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isPremium, setIsPremium] = useState(initialPremium);
  const [tags, setTags] = useState<string[]>(() => [...initialTags]);
  const [tagDraft, setTagDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  /** 提交标签后忽略 IME/浏览器把旧草稿写回受控输入框的一次 onChange */
  const ignoreTagDraftChangeRef = useRef<string | null>(null);

  const isSidebar = variant === "sidebar";
  const supportsPremium = subjectKind === BUILD_SUBJECT_MOC;
  const tagListHref = subjectKind === BUILD_SUBJECT_MOC ? (tag: string) => mocListHref({ tag }) : null;

  const tagsSyncKey = initialTags.join("\u0001");
  const optimisticTagsKey = optimistic?.tags.join("\u0001") ?? "";

  useEffect(() => {
    if (!optimistic) return;
    const match =
      optimistic.displayName.trim() === initialDisplayName.trim() &&
      optimisticTagsKey === tagsSyncKey &&
      optimistic.isPremium === (supportsPremium && initialPremium);
    if (match) setOptimistic(null);
  }, [initialDisplayName, initialPremium, optimistic, optimisticTagsKey, supportsPremium, tagsSyncKey]);

  const viewDisplayName = optimistic?.displayName ?? initialDisplayName;
  const viewTags = optimistic?.tags ?? initialTags;
  const viewIsPremium = supportsPremium && (optimistic?.isPremium ?? initialPremium);
  const catalogName = setOfficial?.catalogName?.trim() ?? "";
  const viewTitle =
    viewDisplayName.trim() || catalogName || `${ui.noun} ${subjectId}`;

  const officialInvTotal =
    setOfficial != null ? setOfficial.sumQty + setOfficial.spareQty : null;

  const sidebarMetaLine = (() => {
    if (!isSidebar || !setOfficial) {
      if (!isSidebar) return null;
      return (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-[var(--muted)]">
          <span>
            {ui.subjectIdLabel} · {subjectId}
          </span>
          {partTotalQty !== null ? (
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
      );
    }

    const o = setOfficial;
    const invTotal = officialInvTotal ?? 0;
    const sheetQty =
      typeof savedSheetPartTotalQty === "number" &&
      Number.isFinite(savedSheetPartTotalQty) &&
      savedSheetPartTotalQty >= 0 &&
      savedSheetPartTotalQty !== invTotal
        ? savedSheetPartTotalQty
        : null;

    return (
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[11px] text-[var(--muted)]">
        <span className="text-[var(--accent)]">{o.setNum}</span>
        {o.year != null ? (
          <>
            <span className="select-none text-[var(--muted-2)]" aria-hidden>
              ·
            </span>
            <span>{o.year}</span>
          </>
        ) : null}
        <span className="select-none text-[var(--muted-2)]" aria-hidden>
          ·
        </span>
        <span>
          种类 <span className="tabular-nums">{o.uniqueParts.toLocaleString("zh-CN")}</span>
        </span>
        <span className="select-none text-[var(--muted-2)]" aria-hidden>
          ·
        </span>
        <span>
          主件 <span className="tabular-nums">{o.sumQty.toLocaleString("zh-CN")}</span> 粒
        </span>
        {o.spareQty > 0 ? (
          <>
            <span className="select-none text-[var(--muted-2)]" aria-hidden>
              ·
            </span>
            <span>
              备用 <span className="tabular-nums">{o.spareQty.toLocaleString("zh-CN")}</span> 粒
            </span>
          </>
        ) : null}
        {sheetQty != null ? (
          <>
            <span className="select-none text-[var(--muted-2)]" aria-hidden>
              ·
            </span>
            <span title="已上传缺件或配货表的粒数合计">
              已存表 <span className="tabular-nums">{sheetQty.toLocaleString("zh-CN")}</span> 粒
            </span>
          </>
        ) : null}
        <span className="select-none text-[var(--muted-2)]" aria-hidden>
          ·
        </span>
        <span className="tabular-nums" title="inventory_id">
          inv {o.invId}
        </span>
      </p>
    );
  })();

  const enterEdit = useCallback(() => {
    const baseName = (optimistic?.displayName ?? initialDisplayName).slice(0, MOC_PROFILE_MAX_DISPLAY_NAME);
    setDisplayName(baseName);
    setIsPremium(supportsPremium && (optimistic?.isPremium ?? initialPremium));
    setTags([...(optimistic?.tags ?? initialTags)]);
    setTagDraft("");
    ignoreTagDraftChangeRef.current = null;
    setError(null);
    setMessage(null);
    setEditing(true);
  }, [initialDisplayName, initialPremium, initialTags, optimistic, supportsPremium]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
    setMessage(null);
    setTagDraft("");
    ignoreTagDraftChangeRef.current = null;
  }, []);

  const commitTagDraft = useCallback((raw: string) => {
    const t = raw.trim();
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
    ignoreTagDraftChangeRef.current = raw;
    setTagDraft("");
  }, []);

  const addTag = useCallback(() => {
    commitTagDraft(tagDraft);
  }, [commitTagDraft, tagDraft]);

  const removeTag = useCallback((idx: number) => {
    setTags((prev) => prev.filter((_, i) => i !== idx));
    setError(null);
  }, []);

  const onSave = useCallback(() => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const r = await saveBuildProfileAction({ subjectKind, subjectId, displayName, tags, isPremium });
      if (r.ok) {
        setOptimistic({ displayName, tags: [...tags], isPremium: supportsPremium && isPremium });
        setMessage("已保存。");
        setEditing(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }, [displayName, isPremium, router, subjectId, subjectKind, supportsPremium, tags]);

  const gobricksTotalLabel =
    typeof gobricksGdsPriceCny === "number" &&
    Number.isFinite(gobricksGdsPriceCny) &&
    gobricksGdsPriceCny >= 0
      ? new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(gobricksGdsPriceCny)
      : null;

  const readOnlyBlock = (
    <div className={isSidebar ? "space-y-3" : "mt-4 space-y-3"}>
      <div className={isSidebar && sidebarTitleAside ? "flex flex-wrap items-start gap-x-3 gap-y-2" : undefined}>
        <div className={isSidebar && sidebarTitleAside ? "min-w-0 flex-1" : undefined}>
          <p
            id={isSidebar ? formTitleId : undefined}
            className={
              isSidebar
                ? "flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-xl font-extrabold tracking-tight text-[var(--text)] sm:text-2xl"
                : "text-lg font-semibold text-[var(--text)]"
            }
          >
            <span className="min-w-0 break-words">{viewTitle}</span>
            {viewIsPremium ? (
              <span
                className="shrink-0 rounded-md bg-gradient-to-br from-fuchsia-500 to-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-white shadow-sm ring-1 ring-white/35"
                title="Premium MOC"
              >
                Premium
              </span>
            ) : null}
            {isSidebar && gobricksTotalLabel ? (
              <span
                className="shrink-0 font-mono text-base font-semibold tabular-nums text-emerald-200/95 sm:text-xl"
                title="高砖整单参考价：接口根字段 gdsPrice（按完整清单分片请求时求和），非缺件子集小计"
              >
                {gobricksTotalLabel}
              </span>
            ) : null}
          </p>
          {sidebarMetaLine}
          {!isSidebar ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              显示名称仅用于本应用列表与标题；{ui.subjectIdLabel}（<span className="font-mono">{subjectId}</span>）不变。
            </p>
          ) : setOfficial ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              库存版本 {setOfficial.invVersion}；显示名称仅用于本应用，set_num 不变。
            </p>
          ) : null}
        </div>
        {isSidebar && sidebarTitleAside ? (
          <div className="flex shrink-0 items-center gap-2 self-start pt-0.5">{sidebarTitleAside}</div>
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
            {viewTags.map((t, i) =>
              tagListHref != null ? (
                <Link
                  key={`${t}-${i}`}
                  href={tagListHref(t)}
                  className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-px text-[11px] text-[var(--text)] underline-offset-2 hover:border-[var(--accent)]/40 hover:underline"
                >
                  {t}
                </Link>
              ) : (
                <span
                  key={`${t}-${i}`}
                  className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-px text-[11px] text-[var(--text)]"
                >
                  {t}
                </span>
              ),
            )}
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
      <div className={isSidebar && sidebarTitleAside ? "flex flex-wrap items-end gap-x-3 gap-y-2" : undefined}>
        <div className={isSidebar && sidebarTitleAside ? "min-w-0 flex-1" : undefined}>
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
              placeholder={catalogName || `${ui.noun} ${subjectId}`}
              aria-label="显示名称"
              className={
                isSidebar
                  ? "field mt-0 w-full border-0 border-b border-[var(--border-soft)] bg-transparent px-0 py-1.5 text-xl font-extrabold tracking-tight text-[var(--text)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-0 sm:text-2xl"
                  : "field mt-1 w-full max-w-md text-sm text-[var(--text)]"
              }
            />
          </label>
          {isSidebar && gobricksTotalLabel ? (
            <p
              className="mt-1 font-mono text-sm font-semibold tabular-nums text-emerald-200/95"
              title="高砖整单参考价：接口根字段 gdsPrice（按完整清单分片请求时求和），非缺件子集小计"
            >
              高砖整单 {gobricksTotalLabel}
            </p>
          ) : null}
          {sidebarMetaLine}
          {!isSidebar ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              显示名称仅用于本应用列表与标题；{ui.subjectIdLabel}（<span className="font-mono">{subjectId}</span>）不变。
            </p>
          ) : setOfficial ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              库存版本 {setOfficial.invVersion}；显示名称仅用于本应用，set_num 不变。
            </p>
          ) : null}
          {supportsPremium ? (
            <label className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text)]">
              <input
                type="checkbox"
                checked={isPremium}
                onChange={(e) => {
                  setIsPremium(e.target.checked);
                  setError(null);
                }}
                disabled={pending}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              <span>标记为 Premium</span>
            </label>
          ) : null}
        </div>
        {isSidebar && sidebarTitleAside ? (
          <div className="flex shrink-0 items-center gap-2 pb-1">{sidebarTitleAside}</div>
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
            onChange={(e) => {
              const next = e.target.value;
              const stale = ignoreTagDraftChangeRef.current;
              if (stale !== null) {
                if (next === stale || next.trim() === stale.trim()) {
                  ignoreTagDraftChangeRef.current = null;
                  return;
                }
                ignoreTagDraftChangeRef.current = null;
              }
              setTagDraft(next);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              commitTagDraft(e.currentTarget.value);
            }}
            autoComplete="off"
            spellCheck={false}
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
          {pending ? "保存中…" : "保存资料"}
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
        {supportsPremium ? "名称、标签与标识" : "名称与标签"}
      </h2>
      {editing ? editFields : readOnlyBlock}
    </section>
  );
}
