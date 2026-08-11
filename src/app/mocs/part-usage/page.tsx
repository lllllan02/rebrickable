import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { listMocPartUsageReports } from "@/app/mocs/moc-part-usage-report-actions";
import {
  MocPartUsageClient,
  type MocPartUsageCandidate,
} from "@/app/mocs/part-usage/moc-part-usage-client";
import { getUserDb } from "@/db/client";
import {
  buildImages,
  buildOwnedSubjects,
  buildProfiles,
  buildSavedPartsSheets,
} from "@/db/schema";
import {
  isWorkflowMarkFilter,
  LIST_MARK_FILTER_OPTIONS,
  parseListMarkFilter,
  type ListMarkFilter,
} from "@/lib/build-list-mark-filter";
import { workflowStageFromRow } from "@/lib/build-workflow-from-row";
import type { BuildWorkflowStage } from "@/lib/build-workflow-stage";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { formatIsoDateTimeFull } from "@/lib/format-display-time";
import { mocListHref } from "@/lib/moc-list-href";
import { mocPartUsageHref } from "@/lib/moc-part-usage-href";
import { MOC_PROFILE_MAX_TAG_LEN, parseTagsJson } from "@/lib/moc-profile-parse";
import { likeFragment } from "@/lib/search";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string; tag?: string; mark?: string; premium?: string }>;
};

export default async function MocPartUsagePage({ searchParams }: Props) {
  const sp = await searchParams;
  const listFilterQ = sp.q;
  const listFilterTag = sp.tag;
  const listFilterMark: ListMarkFilter = parseListMarkFilter(sp.mark);
  const listFilterPremium = sp.premium === "1" || sp.premium === "true";

  const db = getUserDb();
  const rows = await db
    .select({
      subjectId: buildSavedPartsSheets.subjectId,
      totalPartQty: buildSavedPartsSheets.totalPartQty,
      updatedAt: buildSavedPartsSheets.updatedAt,
    })
    .from(buildSavedPartsSheets)
    .where(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC))
    .orderBy(desc(buildSavedPartsSheets.updatedAt), asc(buildSavedPartsSheets.subjectId));

  const subjectIds = rows.map((r) => r.subjectId);
  const profileBySubject = new Map<
    string,
    { displayName: string; tags: string[]; isPremium: boolean }
  >();
  const coverStored = new Map<string, string>();
  const workflowStageBySubjectId = new Map<string, BuildWorkflowStage>();

  if (subjectIds.length > 0) {
    const [profiles, imgs, ownedRows] = await Promise.all([
      db
        .select({
          subjectId: buildProfiles.subjectId,
          displayName: buildProfiles.displayName,
          tagsJson: buildProfiles.tagsJson,
          isPremium: buildProfiles.isPremium,
        })
        .from(buildProfiles)
        .where(
          and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), inArray(buildProfiles.subjectId, subjectIds))
        ),
      db
        .select({
          subjectId: buildImages.subjectId,
          storedFile: buildImages.storedFile,
          createdAt: buildImages.createdAt,
        })
        .from(buildImages)
        .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), inArray(buildImages.subjectId, subjectIds)))
        .orderBy(asc(buildImages.createdAt)),
      db
        .select({
          subjectId: buildOwnedSubjects.subjectId,
          workflowStage: buildOwnedSubjects.workflowStage,
        })
        .from(buildOwnedSubjects)
        .where(
          and(
            eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_MOC),
            inArray(buildOwnedSubjects.subjectId, subjectIds)
          )
        ),
    ]);

    for (const p of profiles) {
      profileBySubject.set(p.subjectId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
        isPremium: Boolean(p.isPremium),
      });
    }
    for (const im of imgs) {
      if (!coverStored.has(im.subjectId)) coverStored.set(im.subjectId, im.storedFile);
    }
    for (const r of ownedRows) {
      const s = workflowStageFromRow(r);
      if (s) workflowStageBySubjectId.set(r.subjectId, s);
    }
  }

  const needle = likeFragment(listFilterQ ?? "").toLowerCase();
  const tagNeedle = (listFilterTag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN).toLowerCase();
  const safeQForHref = likeFragment(listFilterQ ?? "");

  /** 标签 facet 基于「除 tag 以外」的筛选结果，便于切换题材 */
  const baseFilteredRows = rows.filter((r) => {
    if (needle.length > 0) {
      const prof = profileBySubject.get(r.subjectId);
      const dn = (prof?.displayName ?? "").toLowerCase();
      const tags = prof?.tags ?? [];
      const tagStr = tags.join(" ").toLowerCase();
      const sid = r.subjectId.toLowerCase();
      if (!(sid.includes(needle) || dn.includes(needle) || tagStr.includes(needle))) return false;
    }
    if (listFilterPremium && !profileBySubject.get(r.subjectId)?.isPremium) return false;
    if (isWorkflowMarkFilter(listFilterMark)) {
      return workflowStageBySubjectId.get(r.subjectId) === listFilterMark;
    }
    return true;
  });

  const tagFacetList: { key: string; display: string; count: number }[] = [];
  {
    const facetMap = new Map<string, { display: string; count: number }>();
    for (const r of baseFilteredRows) {
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

  const activeTagDisplay =
    tagNeedle.length > 0
      ? tagFacetList.find((x) => x.key === tagNeedle)?.display ??
        (listFilterTag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN)
      : "";
  const hiddenTagValue = tagNeedle.length > 0 ? activeTagDisplay || (listFilterTag ?? "").trim() : "";

  const markFilteredRows = baseFilteredRows.filter((r) => {
    if (tagNeedle.length === 0) return true;
    const tags = profileBySubject.get(r.subjectId)?.tags ?? [];
    return tags.some((t) => t.toLowerCase() === tagNeedle);
  });

  const candidates: MocPartUsageCandidate[] = markFilteredRows.map((r) => {
    const prof = profileBySubject.get(r.subjectId);
    const stored = coverStored.get(r.subjectId);
    const title = (prof?.displayName && prof.displayName.length > 0 ? prof.displayName : r.subjectId) ?? r.subjectId;
    return {
      mocId: r.subjectId,
      title,
      coverUrl: stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, r.subjectId, stored) : null,
      tags: prof?.tags ?? [],
      totalPartQty: r.totalPartQty ?? 0,
    };
  });

  const backHref = mocListHref({
    q: safeQForHref || undefined,
    tag: hiddenTagValue || undefined,
    mark: listFilterMark !== "all" ? listFilterMark : undefined,
    premium: listFilterPremium,
  });

  const hasNonTagFilters =
    needle.length > 0 || listFilterMark !== "all" || listFilterPremium;
  const hasTagFilter = tagNeedle.length > 0;
  const savedReports = await listMocPartUsageReports();

  return (
    <div className="page-stack">
      <section className="space-y-3" aria-labelledby="moc-part-usage-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 id="moc-part-usage-heading" className="page-title text-xl sm:text-2xl">
            零件使用率统计
          </h1>
          <Link
            href={backHref}
            className="text-sm text-[var(--accent)] underline-offset-2 hover:underline"
          >
            返回 MOC 列表
          </Link>
        </div>
        <p className="page-description max-w-3xl">
          先按标签筛一类题材，再勾选或全选作品，分析完整零件表中各 partNum 的使用率。默认按 Score
          排序：Score = 覆盖率 × RelMean（RelMean 为各作「该件用量 / 该作最高用量零件」的平均）。可保存排行榜以便反复查看。
        </p>
        {hasNonTagFilters ? (
          <p className="text-sm text-[var(--muted)]">
            已沿用列表筛选
            {needle.length > 0 ? (
              <>
                ；关键词「<span className="font-mono text-[var(--text)]">{safeQForHref}</span>」
              </>
            ) : null}
            {listFilterPremium ? "；仅 Premium" : null}
            {listFilterMark !== "all" ? (
              <>
                ；进度「
                {LIST_MARK_FILTER_OPTIONS.find((o) => o.key === listFilterMark)?.label ?? listFilterMark}
                」
              </>
            ) : null}
            。
            <Link
              href={mocPartUsageHref({ tag: hiddenTagValue || undefined })}
              className="ml-1 text-[var(--accent)] underline-offset-2 hover:underline"
            >
              清除列表筛选
            </Link>
          </p>
        ) : null}
      </section>

      {savedReports.length > 0 ? (
        <section className="section-panel space-y-3" aria-labelledby="moc-part-usage-saved-heading">
          <h2 id="moc-part-usage-saved-heading" className="text-base font-semibold text-[var(--text)]">
            已保存排行
          </h2>
          <ul className="divide-y divide-[var(--border-soft)] rounded-lg border border-[var(--border-soft)]">
            {savedReports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/mocs/part-usage/${r.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2.5 text-sm no-underline transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="font-medium text-[var(--text)]">{r.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {r.mocCount} 个作品
                    {r.tagHint ? ` · ${r.tagHint}` : ""}
                    {" · "}
                    {formatIsoDateTimeFull(r.analyzedAt) ?? r.analyzedAt.slice(0, 19)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section-panel space-y-3" aria-labelledby="moc-part-usage-tag-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="moc-part-usage-tag-heading" className="text-base font-semibold text-[var(--text)]">
            按标签筛选
          </h2>
          {hasTagFilter ? (
            <Link
              href={mocPartUsageHref({
                q: safeQForHref || undefined,
                mark: listFilterMark !== "all" ? listFilterMark : undefined,
                premium: listFilterPremium,
              })}
              className="text-xs text-[var(--accent)] underline-offset-2 hover:underline"
            >
              清除标签（当前「{activeTagDisplay}」）
            </Link>
          ) : (
            <p className="text-xs text-[var(--muted)]">未选标签时列出全部候选作品</p>
          )}
        </div>
        {tagFacetList.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">当前范围内没有可用标签。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tagFacetList.map((x) => {
              const active = x.key === tagNeedle;
              return (
                <Link
                  key={x.key}
                  href={mocPartUsageHref({
                    q: safeQForHref || undefined,
                    tag: x.display,
                    mark: listFilterMark !== "all" ? listFilterMark : undefined,
                    premium: listFilterPremium,
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
        )}
      </section>

      <MocPartUsageClient key={tagNeedle || "__all__"} candidates={candidates} activeTag={activeTagDisplay || null} />
    </div>
  );
}
