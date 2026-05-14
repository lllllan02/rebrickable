import type { ReactNode } from "react";
import Link from "next/link";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { BuildPartsSheetUpload } from "@/app/build/build-parts-sheet-upload";
import { SavedSubjectListRow } from "@/app/build/saved-subject-list-row";
import { getUserDb } from "@/db/client";
import {
  buildFavoriteSubjects,
  buildImages,
  buildOwnedSubjects,
  buildProfiles,
  buildSavedPartsSheets,
} from "@/db/schema";
import type { ListMarkFilter } from "@/lib/build-list-mark-filter";
import { buildSubjectDetailPath, buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";
import { buildSubjectUi } from "@/lib/build-ui";
import { mocListHref } from "@/lib/moc-list-href";
import { MOC_PROFILE_MAX_TAG_LEN, parseTagsJson } from "@/lib/moc-profile-parse";
import { likeFragment } from "@/lib/search";

export async function BuildSubjectListPage({
  kind,
  officialCatalogSection,
  listFilterQ,
  listFilterTag,
  listFilterMark = "all",
  listHeroTitleOnly = false,
}: {
  kind: BuildSubjectKind;
  /** 插入在上传区之后（例如套装页的官方目录区块） */
  officialCatalogSection?: ReactNode;
  /** 与全站搜索一致：匹配 subject_id、显示名、标签（仅过滤「已存零件表」卡片） */
  listFilterQ?: string;
  /** 仅 MOC 列表：按单个标签精确匹配（忽略大小写） */
  listFilterTag?: string;
  /** 已存列表：按拥有 / 收藏筛选 */
  listFilterMark?: ListMarkFilter;
  /** 仅 MOC 列表页：顶部与套装目录页一致，仅一条 `page-title text-xl sm:text-2xl` 标题，无 hero-panel */
  listHeroTitleOnly?: boolean;
}) {
  const ui = buildSubjectUi(kind);
  if (kind === BUILD_SUBJECT_SET && officialCatalogSection != null) {
    return <div className="page-stack">{officialCatalogSection}</div>;
  }

  const db = getUserDb();
  const listOrderBy =
    kind === BUILD_SUBJECT_MOC
      ? [
          desc(sql`coalesce(${buildSavedPartsSheets.firstSavedAt}, ${buildSavedPartsSheets.updatedAt})`),
          asc(buildSavedPartsSheets.subjectId),
        ]
      : [desc(buildSavedPartsSheets.updatedAt), asc(buildSavedPartsSheets.subjectId)];
  const rows = await db
    .select({
      subjectId: buildSavedPartsSheets.subjectId,
      totalPartQty: buildSavedPartsSheets.totalPartQty,
      updatedAt: buildSavedPartsSheets.updatedAt,
      shortageLineCount: buildSavedPartsSheets.shortageLineCount,
      shortageTotalQty: buildSavedPartsSheets.shortageTotalQty,
      shortageClearedAt: buildSavedPartsSheets.shortageClearedAt,
      gobricksShortageSyncAt: buildSavedPartsSheets.gobricksShortageSyncAt,
    })
    .from(buildSavedPartsSheets)
    .where(eq(buildSavedPartsSheets.subjectKind, kind))
    .orderBy(...listOrderBy);

  const subjectIds = rows.map((r) => r.subjectId);

  const coverStored = new Map<string, string>();
  const profileBySubject = new Map<
    string,
    {
      displayName: string;
      tags: string[];
      hasInstructionsPdf: boolean;
      hasIoSource: boolean;
    }
  >();
  let officialHeroBySet = new Map<string, string | null>();

  if (subjectIds.length > 0) {
    const [profiles, imgs] = await Promise.all([
      db
        .select()
        .from(buildProfiles)
        .where(and(eq(buildProfiles.subjectKind, kind), inArray(buildProfiles.subjectId, subjectIds))),
      db
        .select({
          subjectId: buildImages.subjectId,
          storedFile: buildImages.storedFile,
          createdAt: buildImages.createdAt,
        })
        .from(buildImages)
        .where(and(eq(buildImages.subjectKind, kind), inArray(buildImages.subjectId, subjectIds)))
        .orderBy(asc(buildImages.createdAt)),
    ]);

    for (const p of profiles) {
      profileBySubject.set(p.subjectId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
        hasInstructionsPdf: Boolean(p.hasInstructionsPdf),
        hasIoSource: Boolean(p.hasIoSource),
      });
    }
    for (const im of imgs) {
      if (!coverStored.has(im.subjectId)) {
        coverStored.set(im.subjectId, im.storedFile);
      }
    }

    if (kind === BUILD_SUBJECT_SET) {
      officialHeroBySet = await batchSetCatalogHeroUrls(subjectIds);
    }
  }

  const ownedSubjectIds = new Set<string>();
  const favoriteSubjectIds = new Set<string>();
  if (subjectIds.length > 0) {
    const [ownedRows, favoriteRows] = await Promise.all([
      db
        .select({ subjectId: buildOwnedSubjects.subjectId })
        .from(buildOwnedSubjects)
        .where(and(eq(buildOwnedSubjects.subjectKind, kind), inArray(buildOwnedSubjects.subjectId, subjectIds))),
      db
        .select({ subjectId: buildFavoriteSubjects.subjectId })
        .from(buildFavoriteSubjects)
        .where(and(eq(buildFavoriteSubjects.subjectKind, kind), inArray(buildFavoriteSubjects.subjectId, subjectIds))),
    ]);
    for (const r of ownedRows) ownedSubjectIds.add(r.subjectId);
    for (const r of favoriteRows) favoriteSubjectIds.add(r.subjectId);
  }

  const needle = likeFragment(listFilterQ ?? "").toLowerCase();
  const tagNeedle =
    kind === BUILD_SUBJECT_MOC
      ? (listFilterTag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN).toLowerCase()
      : "";

  const tagFacetList: { key: string; display: string; count: number }[] = [];
  if (kind === BUILD_SUBJECT_MOC && rows.length > 0) {
    const facetMap = new Map<string, { display: string; count: number }>();
    for (const r of rows) {
      const tags = profileBySubject.get(r.subjectId)?.tags ?? [];
      for (const t of tags) {
        const k = t.toLowerCase();
        const prev = facetMap.get(k);
        if (prev) prev.count += 1;
        else facetMap.set(k, { display: t, count: 1 });
      }
    }
    for (const [key, v] of facetMap) {
      tagFacetList.push({ key, display: v.display, count: v.count });
    }
    tagFacetList.sort((a, b) => a.key.localeCompare(b.key, "zh-CN"));
  }

  const safeQForHref = likeFragment(listFilterQ ?? "");
  const activeTagDisplay =
    tagNeedle.length > 0
      ? tagFacetList.find((x) => x.key === tagNeedle)?.display ??
        (listFilterTag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN)
      : "";
  const hiddenTagValue =
    tagNeedle.length > 0
      ? activeTagDisplay || (listFilterTag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN)
      : "";

  const filteredRows = rows.filter((r) => {
    if (needle.length > 0) {
      const prof = profileBySubject.get(r.subjectId);
      const dn = (prof?.displayName ?? "").toLowerCase();
      const tags = prof?.tags ?? [];
      const tagStr = tags.join(" ").toLowerCase();
      const sid = r.subjectId.toLowerCase();
      if (!(sid.includes(needle) || dn.includes(needle) || tagStr.includes(needle))) return false;
    }
    if (tagNeedle.length > 0) {
      const tags = profileBySubject.get(r.subjectId)?.tags ?? [];
      if (!tags.some((t) => t.toLowerCase() === tagNeedle)) return false;
    }
    return true;
  });

  const markFilteredRows = filteredRows.filter((r) => {
    if (listFilterMark === "owned") return ownedSubjectIds.has(r.subjectId);
    if (listFilterMark === "favorite") return favoriteSubjectIds.has(r.subjectId);
    return true;
  });

  const listPath = buildSubjectListPath(kind);
  const hasQFilter = needle.length > 0;
  const hasTagFilter = kind === BUILD_SUBJECT_MOC && tagNeedle.length > 0;
  const hasMarkFilter = listFilterMark !== "all";
  const hasListFilters = hasQFilter || hasTagFilter || hasMarkFilter;
  const clearListHref =
    hasListFilters && kind === BUILD_SUBJECT_MOC
      ? mocListHref({})
      : hasListFilters && kind === BUILD_SUBJECT_SET
        ? "/sets"
        : listPath;

  return (
    <div className="page-stack">
      {officialCatalogSection == null ? (
        listHeroTitleOnly ? (
          <section className="space-y-4" aria-labelledby="mocs-saved-list-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="mocs-saved-list-heading" className="page-title text-xl sm:text-2xl">
                MOC 目录
              </h2>
              <BuildPartsSheetUpload kind={kind} variant="minimal" />
            </div>
          </section>
        ) : (
          <section className="hero-panel">
            <p className="page-kicker">{ui.listKicker}</p>
            <h1 className="page-title">
              {ui.noun} {ui.listTitleSuffix}
            </h1>
            <p className="page-description">
              在下方上传缺货表 CSV 后，将在临时预览页核对并保存到本地 SQLite；此处列出全部已存{ui.noun}。封面取该{ui.noun}{" "}
              <strong className="font-medium text-[var(--text)]">最早上传</strong> 的一张参考图；可在详情页修改显示名称与标签。
            </p>
          </section>
        )
      ) : null}
      {officialCatalogSection == null && !listHeroTitleOnly ? <BuildPartsSheetUpload kind={kind} /> : null}
      {officialCatalogSection ?? null}
      {kind === BUILD_SUBJECT_MOC && officialCatalogSection == null ? (
        <section className="section-panel">
          <form
            action="/mocs"
            method="get"
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            role="search"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {(
                [
                  { key: "all" as const, label: "全部" },
                  { key: "owned" as const, label: "已拥有" },
                  { key: "favorite" as const, label: "已收藏" },
                ] as const
              ).map((opt) => {
                const active = listFilterMark === opt.key;
                const tagArg = hiddenTagValue || undefined;
                return (
                  <Link
                    key={opt.key}
                    href={mocListHref({
                      q: safeQForHref,
                      tag: tagArg,
                      mark: opt.key === "all" ? undefined : opt.key,
                    })}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                        : "border-[var(--border-soft)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]/35"
                    }`}
                  >
                    {opt.label}
                  </Link>
                );
              })}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[12rem]">
              <label htmlFor="moc-list-q" className="text-xs font-medium text-[var(--muted)]">
                搜索
              </label>
              <input
                id="moc-list-q"
                name="q"
                type="search"
                enterKeyHint="search"
                placeholder="MOC ID、显示名称或标签…"
                defaultValue={safeQForHref}
                maxLength={80}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)]/25 placeholder:text-[var(--muted-2)] focus:border-[var(--accent)]/50 focus:ring-2"
              />
            </div>
            {hiddenTagValue ? <input type="hidden" name="tag" value={hiddenTagValue} /> : null}
            {listFilterMark === "owned" || listFilterMark === "favorite" ? (
              <input type="hidden" name="mark" value={listFilterMark} />
            ) : null}
            <div className="flex shrink-0 gap-2">
              <button
                type="submit"
                className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]/15"
              >
                搜索
              </button>
              {hasListFilters ? (
                <Link
                  href="/mocs"
                  className="inline-flex items-center justify-center rounded-lg border border-[var(--border-soft)] px-4 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
                >
                  重置
                </Link>
              ) : null}
            </div>
          </form>
          {tagFacetList.length > 0 ? (
            <details className="group mt-4 border-t border-[var(--border-soft)] pt-4">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-[var(--muted)] select-none [&::-webkit-details-marker]:hidden">
                <span
                  className="inline-block text-[10px] leading-none text-[var(--muted-2)] transition-transform duration-200 group-open:rotate-90"
                  aria-hidden
                >
                  ▶
                </span>
                按标签筛选
                {hasTagFilter ? (
                  <span className="font-normal text-[var(--text)]">
                    （已选「<span className="font-medium">{activeTagDisplay}</span>」）
                  </span>
                ) : null}
              </summary>
              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {tagFacetList.map((x) => {
                    const active = x.key === tagNeedle;
                    return (
                      <Link
                        key={x.key}
                        href={mocListHref({
                          q: safeQForHref,
                          tag: x.display,
                          mark: listFilterMark !== "all" ? listFilterMark : undefined,
                        })}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                            : "border-[var(--border-soft)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)]/35"
                        }`}
                      >
                        <span>{x.display}</span>
                        <span className="tabular-nums text-[var(--muted)]">({x.count})</span>
                      </Link>
                    );
                  })}
                </div>
                {hasTagFilter ? (
                  <p className="text-xs text-[var(--muted)]">
                    <Link
                      href={mocListHref({
                        q: safeQForHref,
                        mark: listFilterMark !== "all" ? listFilterMark : undefined,
                      })}
                      className="text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      仅清除标签
                    </Link>
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
      <div className="table-shell">
          {hasListFilters ? (
            <p className="mb-4 px-2 text-sm text-[var(--muted)]">
              已存列表
              {hasQFilter ? (
                <>
                  按关键词「<span className="font-mono text-[var(--text)]">{safeQForHref || needle}</span>」
                </>
              ) : null}
              {hasQFilter && hasTagFilter ? "且 " : null}
              {hasTagFilter ? (
                <>
                  按标签「<span className="text-[var(--text)]">{activeTagDisplay}</span>」
                </>
              ) : null}
              {hasMarkFilter ? (
                <>
                  {(hasQFilter || hasTagFilter) ? "且" : null}
                  仅显示「
                  <span className="text-[var(--text)]">
                    {listFilterMark === "owned" ? "已拥有" : "已收藏"}
                  </span>
                  」
                </>
              ) : null}
              {hasQFilter || hasTagFilter ? "筛选，" : hasMarkFilter ? "，" : null}
              共 {markFilteredRows.length.toLocaleString("zh-CN")} 条
              {hasMarkFilter && markFilteredRows.length < filteredRows.length
                ? `（未加拥有/收藏筛选前 ${filteredRows.length.toLocaleString("zh-CN")} 条）`
                : ""}
              {!hasMarkFilter && filteredRows.length < rows.length
                ? `（未加搜索/标签筛选前 ${rows.length.toLocaleString("zh-CN")} 条）`
                : ""}
              {" · "}
              <Link href={clearListHref} className="text-[var(--accent)] underline-offset-2 hover:underline">
                清除筛选
              </Link>
            </p>
          ) : null}
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-sm text-[var(--muted)]">
              尚无已存记录。请使用上方上传入口导入 CSV，在预览页保存到数据库。
            </p>
          ) : filteredRows.length === 0 ? (
            <p className="px-2 py-6 text-sm text-[var(--muted)]">
              没有匹配的已存{ui.noun}。可调整关键词或{" "}
              <Link href={clearListHref} className="text-[var(--accent)] underline-offset-2 hover:underline">
                清除筛选
              </Link>
              查看全部。
            </p>
          ) : markFilteredRows.length === 0 ? (
            <p className="px-2 py-6 text-sm text-[var(--muted)]">
              当前条件下没有
              {listFilterMark === "owned" ? "已标记拥有" : "已加入收藏"}
              的已存{ui.noun}。可更换筛选或{" "}
              <Link href={clearListHref} className="text-[var(--accent)] underline-offset-2 hover:underline">
                清除筛选
              </Link>
              。
            </p>
          ) : (
            <ul className="list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {markFilteredRows.map((r) => {
                const prof = profileBySubject.get(r.subjectId);
                const displayName = prof?.displayName?.trim() ?? "";
                const title = displayName || `${ui.noun} ${r.subjectId}`;
                const tags = prof?.tags ?? [];
                const stored = coverStored.get(r.subjectId);
                const uploadCoverUrl = stored ? buildImagePublicPath(kind, r.subjectId, stored) : null;
                const officialUrl = kind === BUILD_SUBJECT_SET ? officialHeroBySet.get(r.subjectId) ?? null : null;
                const coverUrl =
                  kind === BUILD_SUBJECT_SET
                    ? (officialUrl && officialUrl.length > 0 ? officialUrl : null) ?? uploadCoverUrl
                    : uploadCoverUrl;
                const detailHref = buildSubjectDetailPath(kind, r.subjectId);

                const owned = ownedSubjectIds.has(r.subjectId);
                const favorite = favoriteSubjectIds.has(r.subjectId);
                const showInstructionBadge =
                  kind === BUILD_SUBJECT_MOC && Boolean(prof?.hasInstructionsPdf);
                const showSourceBadge = kind === BUILD_SUBJECT_MOC && Boolean(prof?.hasIoSource);
                return (
                  <SavedSubjectListRow
                    key={r.subjectId}
                    kind={kind}
                    subjectId={r.subjectId}
                    detailHref={detailHref}
                    title={title}
                    coverUrl={coverUrl && coverUrl.length > 0 ? coverUrl : null}
                    tags={tags}
                    mocTagHref={
                      kind === BUILD_SUBJECT_MOC
                        ? (tag: string) =>
                            mocListHref({
                              q: safeQForHref,
                              tag,
                              mark: listFilterMark !== "all" ? listFilterMark : undefined,
                            })
                        : undefined
                    }
                    totalPartQty={r.totalPartQty}
                    shortageLineCount={r.shortageLineCount ?? null}
                    shortageTotalQty={r.shortageTotalQty ?? null}
                    shortageClearedAt={r.shortageClearedAt ?? null}
                    gobricksShortageSyncAt={r.gobricksShortageSyncAt ?? null}
                    updatedAtIso={r.updatedAt}
                    owned={owned}
                    favorite={favorite}
                    showInstructionBadge={showInstructionBadge}
                    showSourceBadge={showSourceBadge}
                  />
                );
              })}
            </ul>
          )}
      </div>
    </div>
  );
}
