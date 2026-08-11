import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { loadMocPartUsageReport } from "@/app/mocs/moc-part-usage-report-actions";
import { MocPartUsageReportClient } from "@/app/mocs/part-usage/[reportId]/moc-part-usage-report-client";
import type { MocPartUsageCandidate } from "@/app/mocs/part-usage/moc-part-usage-client";
import { getUserDb } from "@/db/client";
import { buildImages, buildProfiles, buildSavedPartsSheets } from "@/db/schema";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { MOC_PROFILE_MAX_TAG_LEN, parseTagsJson } from "@/lib/moc-profile-parse";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{ sort?: string; dir?: string }>;
};

export default async function MocPartUsageReportPage({ params, searchParams }: Props) {
  const { reportId: reportIdRaw } = await params;
  const sp = await searchParams;
  const reportId = Number(reportIdRaw);
  if (!Number.isFinite(reportId) || reportId <= 0) notFound();

  const report = await loadMocPartUsageReport(reportId);
  if (!report) notFound();

  const tagNeedle = (report.tagHint ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN).toLowerCase();

  const db = getUserDb();
  const rows = await db
    .select({
      subjectId: buildSavedPartsSheets.subjectId,
      totalPartQty: buildSavedPartsSheets.totalPartQty,
    })
    .from(buildSavedPartsSheets)
    .where(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC))
    .orderBy(desc(buildSavedPartsSheets.updatedAt), asc(buildSavedPartsSheets.subjectId));

  const subjectIds = rows.map((r) => r.subjectId);
  const profileBySubject = new Map<string, { displayName: string; tags: string[] }>();
  const coverStored = new Map<string, string>();

  if (subjectIds.length > 0) {
    const [profiles, imgs] = await Promise.all([
      db
        .select({
          subjectId: buildProfiles.subjectId,
          displayName: buildProfiles.displayName,
          tagsJson: buildProfiles.tagsJson,
        })
        .from(buildProfiles)
        .where(
          and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), inArray(buildProfiles.subjectId, subjectIds))
        ),
      db
        .select({
          subjectId: buildImages.subjectId,
          storedFile: buildImages.storedFile,
        })
        .from(buildImages)
        .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), inArray(buildImages.subjectId, subjectIds)))
        .orderBy(asc(buildImages.createdAt)),
    ]);
    for (const p of profiles) {
      profileBySubject.set(p.subjectId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
      });
    }
    for (const im of imgs) {
      if (!coverStored.has(im.subjectId)) coverStored.set(im.subjectId, im.storedFile);
    }
  }

  /** 含当前成员；客户端按 memberIds 排除，移除后可再添加 */
  const addCandidates: MocPartUsageCandidate[] = [];
  for (const r of rows) {
    const prof = profileBySubject.get(r.subjectId);
    if (tagNeedle.length > 0) {
      const tags = prof?.tags ?? [];
      if (!tags.some((t) => t.toLowerCase() === tagNeedle)) continue;
    }
    const stored = coverStored.get(r.subjectId);
    addCandidates.push({
      mocId: r.subjectId,
      title: prof?.displayName && prof.displayName.length > 0 ? prof.displayName : r.subjectId,
      coverUrl: stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, r.subjectId, stored) : null,
      tags: prof?.tags ?? [],
      totalPartQty: r.totalPartQty ?? 0,
    });
  }

  return (
    <div className="page-stack">
      <section className="space-y-3" aria-labelledby="report-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 id="report-heading" className="page-title text-xl sm:text-2xl">
            {report.name}
          </h1>
          <Link
            href="/mocs/part-usage"
            className="text-sm text-[var(--accent)] underline-offset-2 hover:underline"
          >
            返回使用率页
          </Link>
        </div>
        <p className="page-description max-w-3xl">
          已保存的零件使用率排行。可增删作品后自动重算，或手动按当前零件表刷新结果。Score /
          RelMean 含义见排行表上方说明。
        </p>
      </section>

      <MocPartUsageReportClient
        reportId={report.id}
        initialName={report.name}
        tagHint={report.tagHint}
        analyzedAt={report.analyzedAt}
        initialMocs={report.mocs}
        initialRows={report.rows}
        addCandidates={addCandidates}
        initialSortKey={sp.sort}
        initialSortDir={sp.dir}
      />
    </div>
  );
}
