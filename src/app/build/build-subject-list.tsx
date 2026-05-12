import type { ReactNode } from "react";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { BuildOwnedToggle } from "@/app/build/build-owned-toggle";
import { BuildPartsSheetUpload } from "@/app/build/build-parts-sheet-upload";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { getDb } from "@/db/client";
import { buildImages, buildOwnedSubjects, buildProfiles, buildSavedPartsSheets } from "@/db/schema";
import { buildSubjectDetailPath, buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";
import { buildSubjectUi } from "@/lib/build-ui";
import { MOC_PROFILE_MAX_TAG_LEN, parseTagsJson } from "@/lib/moc-profile-parse";
import { likeFragment } from "@/lib/search";

function mocListHref(params: { q?: string; tag?: string }): string {
  const sp = new URLSearchParams();
  const q = likeFragment(params.q ?? "");
  if (q.length > 0) sp.set("q", q);
  const tag = (params.tag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN);
  if (tag.length > 0) sp.set("tag", tag);
  const qs = sp.toString();
  return qs ? `/mocs?${qs}` : "/mocs";
}

export async function BuildSubjectListPage({
  kind,
  officialCatalogSection,
  listFilterQ,
  listFilterTag,
}: {
  kind: BuildSubjectKind;
  /** 插入在上传区之后（例如套装页的官方清单，布局与 MOC 列表卡片一致） */
  officialCatalogSection?: ReactNode;
  /** 与全站搜索一致：匹配 subject_id、显示名、标签（仅过滤「已存零件表」卡片） */
  listFilterQ?: string;
  /** 仅 MOC 列表：按单个标签精确匹配（忽略大小写） */
  listFilterTag?: string;
}) {
  const ui = buildSubjectUi(kind);
  const db = getDb();
  const rows = await db
    .select({
      subjectId: buildSavedPartsSheets.subjectId,
      totalPartQty: buildSavedPartsSheets.totalPartQty,
      updatedAt: buildSavedPartsSheets.updatedAt,
    })
    .from(buildSavedPartsSheets)
    .where(eq(buildSavedPartsSheets.subjectKind, kind))
    .orderBy(desc(buildSavedPartsSheets.updatedAt));

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
  if (subjectIds.length > 0) {
    const ownedRows = await db
      .select({ subjectId: buildOwnedSubjects.subjectId })
      .from(buildOwnedSubjects)
      .where(and(eq(buildOwnedSubjects.subjectKind, kind), inArray(buildOwnedSubjects.subjectId, subjectIds)));
    for (const r of ownedRows) ownedSubjectIds.add(r.subjectId);
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

  const listPath = buildSubjectListPath(kind);
  const hasQFilter = needle.length > 0;
  const hasTagFilter = kind === BUILD_SUBJECT_MOC && tagNeedle.length > 0;
  const hasListFilters = hasQFilter || hasTagFilter;
  const clearListHref = hasListFilters ? (kind === BUILD_SUBJECT_MOC ? mocListHref({}) : listPath) : listPath;

  return (
    <div className="page-stack">
      {officialCatalogSection == null ? (
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
      ) : null}
      {officialCatalogSection == null ? <BuildPartsSheetUpload kind={kind} /> : null}
      {officialCatalogSection ?? null}
      {kind === BUILD_SUBJECT_MOC && officialCatalogSection == null ? (
        <section className="section-panel">
          <form
            action="/mocs"
            method="get"
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
            role="search"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
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
            <div className="mt-5 border-t border-[var(--border-soft)] pt-4">
              <p className="mb-2 text-xs font-medium text-[var(--muted)]">按标签筛选</p>
              <div className="flex flex-wrap gap-2">
                {tagFacetList.map((x) => {
                  const active = x.key === tagNeedle;
                  return (
                    <Link
                      key={x.key}
                      href={mocListHref({ q: safeQForHref, tag: x.display })}
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
                <p className="mt-3 text-xs text-[var(--muted)]">
                  已选标签「<span className="font-medium text-[var(--text)]">{activeTagDisplay}</span>」·{" "}
                  <Link href={mocListHref({ q: safeQForHref })} className="text-[var(--accent)] underline-offset-2 hover:underline">
                    仅清除标签
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="table-shell">
        {officialCatalogSection != null ? (
          <h2 className="section-title mb-4 mt-10 text-[var(--text)]">已存零件表</h2>
        ) : null}
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
            筛选，共 {filteredRows.length.toLocaleString("zh-CN")} 条
            {filteredRows.length < rows.length
              ? `（未筛选共 ${rows.length.toLocaleString("zh-CN")} 条）`
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
        ) : (
          <ul className="list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredRows.map((r) => {
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
              const savedAt = r.updatedAt.slice(0, 19).replace("T", " ");

              const owned = ownedSubjectIds.has(r.subjectId);
              const showInstructionBadge =
                kind === BUILD_SUBJECT_MOC && Boolean(prof?.hasInstructionsPdf);
              const showSourceBadge = kind === BUILD_SUBJECT_MOC && Boolean(prof?.hasIoSource);
              return (
                <li
                  key={r.subjectId}
                  className={`result-card flex flex-col gap-0 overflow-hidden p-0${owned ? " result-card--owned" : ""}`}
                >
                  <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]">
                    <Link
                      href={detailHref}
                      className="absolute inset-0 z-0 block"
                      aria-label={`${title} 封面`}
                    >
                      {coverUrl ? (
                        <RemoteCoverImage
                          src={coverUrl}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          alt=""
                          fallbackLabel="无参考图"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
                          无参考图
                        </span>
                      )}
                    </Link>
                    <div className="pointer-events-none absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1">
                      {showInstructionBadge || showSourceBadge ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          {showInstructionBadge ? (
                            <span
                              className="rounded-md bg-gradient-to-br from-amber-400 to-orange-600 px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-white shadow-md ring-1 ring-white/35 sm:text-[10px]"
                              title="含 PDF 说明书"
                            >
                              PDF
                            </span>
                          ) : null}
                          {showSourceBadge ? (
                            <span
                              className="rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-white shadow-md ring-1 ring-white/35 sm:text-[10px]"
                              title="含 Studio .io 源文件"
                            >
                              IO
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="pointer-events-auto">
                        <BuildOwnedToggle
                          subjectKind={kind}
                          subjectId={r.subjectId}
                          initialOwned={owned}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
                    <div className="min-w-0">
                      <Link
                        href={detailHref}
                        className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 truncate font-mono text-xs text-[var(--muted)]" title={r.subjectId}>
                        {r.subjectId}
                      </p>
                    </div>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t, i) =>
                          kind === BUILD_SUBJECT_MOC ? (
                            <Link
                              key={`${r.subjectId}-${t}-${i}`}
                              href={mocListHref({ q: safeQForHref, tag: t })}
                              className="rounded border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text)] underline-offset-2 hover:border-[var(--accent)]/40 hover:underline"
                            >
                              {t}
                            </Link>
                          ) : (
                            <span
                              key={`${r.subjectId}-${t}-${i}`}
                              className="rounded border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text)]"
                            >
                              {t}
                            </span>
                          ),
                        )}
                      </div>
                    ) : null}
                    <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--muted)]">
                      <span className="tabular-nums text-[var(--text)]">
                        <span className="text-[var(--muted-2)]">零件总数 </span>
                        {r.totalPartQty.toLocaleString("zh-CN")}
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="text-[var(--muted-2)]">保存时间 </span>
                        <time dateTime={r.updatedAt}>{savedAt}</time>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
