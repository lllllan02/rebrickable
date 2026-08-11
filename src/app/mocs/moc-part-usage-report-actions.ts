"use server";

import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getUserDb } from "@/db/client";
import {
  buildImages,
  buildMocPartUsageReportMocs,
  buildMocPartUsageReports,
  buildProfiles,
} from "@/db/schema";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import {
  computeMocPartUsageForMocIds,
  enrichMocPartUsageStatRows,
  MOC_PART_USAGE_MAX_MOCS,
  normalizeMocPartUsageIds,
  parseMocPartUsageStatRows,
  serializeMocPartUsageStatRows,
} from "@/lib/moc-part-usage-compute";
import type { MocPartUsageEnrichedRow, MocPartUsageSkipped } from "@/lib/moc-part-usage-stats";
import { parseTagsJson } from "@/lib/moc-profile-parse";

const REPORT_NAME_MAX = 80;

export type MocPartUsageReportListItem = {
  id: number;
  name: string;
  tagHint: string | null;
  mocCount: number;
  analyzedAt: string;
  updatedAt: string;
};

export type MocPartUsageReportMoc = {
  mocId: string;
  title: string;
  coverUrl: string | null;
  tags: string[];
};

export type LoadedMocPartUsageReport = {
  id: number;
  name: string;
  tagHint: string | null;
  analyzedAt: string;
  updatedAt: string;
  mocs: MocPartUsageReportMoc[];
  rows: MocPartUsageEnrichedRow[];
};

function revalidatePartUsagePaths(reportId?: number) {
  revalidatePath("/mocs/part-usage");
  if (reportId != null) revalidatePath(`/mocs/part-usage/${reportId}`);
}

function normalizeReportName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > REPORT_NAME_MAX) return null;
  return name;
}

function normalizeTagHint(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t.length > 0 ? t.slice(0, 40) : null;
}

async function loadMocCards(mocIds: string[]): Promise<MocPartUsageReportMoc[]> {
  if (mocIds.length === 0) return [];
  const db = getUserDb();
  const [profiles, imgs] = await Promise.all([
    db
      .select({
        subjectId: buildProfiles.subjectId,
        displayName: buildProfiles.displayName,
        tagsJson: buildProfiles.tagsJson,
      })
      .from(buildProfiles)
      .where(
        and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), inArray(buildProfiles.subjectId, mocIds))
      ),
    db
      .select({
        subjectId: buildImages.subjectId,
        storedFile: buildImages.storedFile,
        createdAt: buildImages.createdAt,
      })
      .from(buildImages)
      .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), inArray(buildImages.subjectId, mocIds)))
      .orderBy(asc(buildImages.createdAt)),
  ]);

  const profileById = new Map(
    profiles.map((p) => [
      p.subjectId,
      {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
      },
    ])
  );
  const coverById = new Map<string, string>();
  for (const im of imgs) {
    if (!coverById.has(im.subjectId)) coverById.set(im.subjectId, im.storedFile);
  }

  return mocIds.map((mocId) => {
    const prof = profileById.get(mocId);
    const stored = coverById.get(mocId);
    return {
      mocId,
      title: prof?.displayName && prof.displayName.length > 0 ? prof.displayName : mocId,
      coverUrl: stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, mocId, stored) : null,
      tags: prof?.tags ?? [],
    };
  });
}

async function recomputeAndPersistReport(
  reportId: number,
  mocIds: string[]
): Promise<
  | { ok: true; analyzedMocIds: string[]; skipped: MocPartUsageSkipped[]; rows: MocPartUsageEnrichedRow[] }
  | { ok: false; error: string }
> {
  if (mocIds.length === 0) {
    return { ok: false, error: "报告中至少需要一个作品。" };
  }
  const computed = await computeMocPartUsageForMocIds(mocIds);
  const now = new Date().toISOString();
  const db = getUserDb();
  await db
    .update(buildMocPartUsageReports)
    .set({
      resultsJson: serializeMocPartUsageStatRows(computed.statRows),
      analyzedAt: now,
      updatedAt: now,
    })
    .where(eq(buildMocPartUsageReports.id, reportId));
  revalidatePartUsagePaths(reportId);
  return {
    ok: true,
    analyzedMocIds: computed.analyzedMocIds,
    skipped: computed.skipped,
    rows: computed.rows,
  };
}

export async function listMocPartUsageReports(): Promise<MocPartUsageReportListItem[]> {
  const db = getUserDb();
  const reports = await db
    .select({
      id: buildMocPartUsageReports.id,
      name: buildMocPartUsageReports.name,
      tagHint: buildMocPartUsageReports.tagHint,
      analyzedAt: buildMocPartUsageReports.analyzedAt,
      updatedAt: buildMocPartUsageReports.updatedAt,
    })
    .from(buildMocPartUsageReports)
    .orderBy(desc(buildMocPartUsageReports.updatedAt), desc(buildMocPartUsageReports.id));

  if (reports.length === 0) return [];

  const ids = reports.map((r) => r.id);
  const countRows = await db
    .select({
      reportId: buildMocPartUsageReportMocs.reportId,
      c: count(),
    })
    .from(buildMocPartUsageReportMocs)
    .where(inArray(buildMocPartUsageReportMocs.reportId, ids))
    .groupBy(buildMocPartUsageReportMocs.reportId);
  const countById = new Map(countRows.map((r) => [r.reportId, Number(r.c)]));

  return reports.map((r) => ({
    id: r.id,
    name: r.name,
    tagHint: r.tagHint,
    mocCount: countById.get(r.id) ?? 0,
    analyzedAt: r.analyzedAt,
    updatedAt: r.updatedAt,
  }));
}

export async function loadMocPartUsageReport(
  reportIdRaw: number
): Promise<LoadedMocPartUsageReport | null> {
  const reportId = Number(reportIdRaw);
  if (!Number.isFinite(reportId) || reportId <= 0) return null;

  const db = getUserDb();
  const [report] = await db
    .select()
    .from(buildMocPartUsageReports)
    .where(eq(buildMocPartUsageReports.id, reportId))
    .limit(1);
  if (!report) return null;

  const memberRows = await db
    .select({ mocId: buildMocPartUsageReportMocs.mocId })
    .from(buildMocPartUsageReportMocs)
    .where(eq(buildMocPartUsageReportMocs.reportId, reportId))
    .orderBy(asc(buildMocPartUsageReportMocs.addedAt), asc(buildMocPartUsageReportMocs.mocId));

  const mocIds = memberRows.map((m) => m.mocId);
  const statRows = parseMocPartUsageStatRows(report.resultsJson) ?? [];
  const [mocs, rows] = await Promise.all([loadMocCards(mocIds), enrichMocPartUsageStatRows(statRows)]);

  return {
    id: report.id,
    name: report.name,
    tagHint: report.tagHint,
    analyzedAt: report.analyzedAt,
    updatedAt: report.updatedAt,
    mocs,
    rows,
  };
}

export async function saveMocPartUsageReportAction(input: {
  name: string;
  tagHint?: string | null;
  mocIds: unknown;
}): Promise<{ ok: true; reportId: number } | { ok: false; error: string }> {
  const name = normalizeReportName(input.name);
  if (!name) {
    return { ok: false, error: `名称无效（1–${REPORT_NAME_MAX} 个字符）。` };
  }
  const mocIds = normalizeMocPartUsageIds(input.mocIds);
  if (mocIds == null) {
    return { ok: false, error: `请选择不超过 ${MOC_PART_USAGE_MAX_MOCS} 个有效的 MOC。` };
  }
  if (mocIds.length === 0) {
    return { ok: false, error: "请至少选择一个 MOC。" };
  }

  try {
    const computed = await computeMocPartUsageForMocIds(mocIds);
    if (computed.analyzedMocIds.length === 0) {
      return { ok: false, error: "没有可统计的作品（均无完整零件表）。" };
    }

    const now = new Date().toISOString();
    const db = getUserDb();
    const [inserted] = await db
      .insert(buildMocPartUsageReports)
      .values({
        name,
        tagHint: normalizeTagHint(input.tagHint),
        resultsJson: serializeMocPartUsageStatRows(computed.statRows),
        analyzedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: buildMocPartUsageReports.id });

    const reportId = inserted?.id;
    if (reportId == null) {
      return { ok: false, error: "保存失败。" };
    }

    // 成员保存用户选中的全部 ID（含被跳过的），便于后续补全零件表后重算
    await db.insert(buildMocPartUsageReportMocs).values(
      mocIds.map((mocId) => ({
        reportId,
        mocId,
        addedAt: now,
      }))
    );

    revalidatePartUsagePaths(reportId);
    return { ok: true, reportId };
  } catch {
    return { ok: false, error: "保存排行榜失败，请重试。" };
  }
}

export async function updateMocPartUsageReportNameAction(input: {
  reportId: number;
  name: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reportId = Number(input.reportId);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return { ok: false, error: "报告无效。" };
  }
  const name = normalizeReportName(input.name);
  if (!name) {
    return { ok: false, error: `名称无效（1–${REPORT_NAME_MAX} 个字符）。` };
  }

  try {
    const db = getUserDb();
    const [existing] = await db
      .select({ id: buildMocPartUsageReports.id })
      .from(buildMocPartUsageReports)
      .where(eq(buildMocPartUsageReports.id, reportId))
      .limit(1);
    if (!existing) return { ok: false, error: "报告不存在。" };

    await db
      .update(buildMocPartUsageReports)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(buildMocPartUsageReports.id, reportId));
    revalidatePartUsagePaths(reportId);
    return { ok: true };
  } catch {
    return { ok: false, error: "重命名失败。" };
  }
}

export async function deleteMocPartUsageReportAction(input: {
  reportId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reportId = Number(input.reportId);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return { ok: false, error: "报告无效。" };
  }

  try {
    const db = getUserDb();
    await db
      .delete(buildMocPartUsageReportMocs)
      .where(eq(buildMocPartUsageReportMocs.reportId, reportId));
    await db.delete(buildMocPartUsageReports).where(eq(buildMocPartUsageReports.id, reportId));
    revalidatePartUsagePaths();
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败。" };
  }
}

export async function addMocsToPartUsageReportAction(input: {
  reportId: number;
  mocIds: unknown;
}): Promise<
  | { ok: true; analyzedMocIds: string[]; skipped: MocPartUsageSkipped[]; rows: MocPartUsageEnrichedRow[] }
  | { ok: false; error: string }
> {
  const reportId = Number(input.reportId);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return { ok: false, error: "报告无效。" };
  }
  const addIds = normalizeMocPartUsageIds(input.mocIds);
  if (addIds == null || addIds.length === 0) {
    return { ok: false, error: "请选择要添加的有效 MOC。" };
  }

  try {
    const db = getUserDb();
    const [existing] = await db
      .select({ id: buildMocPartUsageReports.id })
      .from(buildMocPartUsageReports)
      .where(eq(buildMocPartUsageReports.id, reportId))
      .limit(1);
    if (!existing) return { ok: false, error: "报告不存在。" };

    const current = await db
      .select({ mocId: buildMocPartUsageReportMocs.mocId })
      .from(buildMocPartUsageReportMocs)
      .where(eq(buildMocPartUsageReportMocs.reportId, reportId));
    const currentSet = new Set(current.map((c) => c.mocId));
    const toAdd = addIds.filter((id) => !currentSet.has(id));
    if (currentSet.size + toAdd.length > MOC_PART_USAGE_MAX_MOCS) {
      return { ok: false, error: `作品总数不能超过 ${MOC_PART_USAGE_MAX_MOCS}。` };
    }
    if (toAdd.length === 0) {
      return { ok: false, error: "所选作品已在报告中。" };
    }

    const now = new Date().toISOString();
    await db.insert(buildMocPartUsageReportMocs).values(
      toAdd.map((mocId) => ({
        reportId,
        mocId,
        addedAt: now,
      }))
    );

    const allIds = [...currentSet, ...toAdd];
    return recomputeAndPersistReport(reportId, allIds);
  } catch {
    return { ok: false, error: "添加作品失败。" };
  }
}

export async function removeMocFromPartUsageReportAction(input: {
  reportId: number;
  mocId: string;
}): Promise<
  | { ok: true; analyzedMocIds: string[]; skipped: MocPartUsageSkipped[]; rows: MocPartUsageEnrichedRow[] }
  | { ok: false; error: string }
> {
  const reportId = Number(input.reportId);
  const mocId = typeof input.mocId === "string" ? input.mocId.trim() : "";
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return { ok: false, error: "报告无效。" };
  }
  if (!mocId) return { ok: false, error: "作品无效。" };

  try {
    const db = getUserDb();
    const current = await db
      .select({ mocId: buildMocPartUsageReportMocs.mocId })
      .from(buildMocPartUsageReportMocs)
      .where(eq(buildMocPartUsageReportMocs.reportId, reportId));
    if (!current.some((c) => c.mocId === mocId)) {
      return { ok: false, error: "作品不在报告中。" };
    }
    if (current.length <= 1) {
      return { ok: false, error: "至少保留一个作品；若要清空请删除整份报告。" };
    }

    await db
      .delete(buildMocPartUsageReportMocs)
      .where(
        and(
          eq(buildMocPartUsageReportMocs.reportId, reportId),
          eq(buildMocPartUsageReportMocs.mocId, mocId)
        )
      );

    const remain = current.map((c) => c.mocId).filter((id) => id !== mocId);
    return recomputeAndPersistReport(reportId, remain);
  } catch {
    return { ok: false, error: "移除作品失败。" };
  }
}

export async function recomputeMocPartUsageReportAction(input: {
  reportId: number;
}): Promise<
  | { ok: true; analyzedMocIds: string[]; skipped: MocPartUsageSkipped[]; rows: MocPartUsageEnrichedRow[] }
  | { ok: false; error: string }
> {
  const reportId = Number(input.reportId);
  if (!Number.isFinite(reportId) || reportId <= 0) {
    return { ok: false, error: "报告无效。" };
  }

  try {
    const db = getUserDb();
    const [existing] = await db
      .select({ id: buildMocPartUsageReports.id })
      .from(buildMocPartUsageReports)
      .where(eq(buildMocPartUsageReports.id, reportId))
      .limit(1);
    if (!existing) return { ok: false, error: "报告不存在。" };

    const members = await db
      .select({ mocId: buildMocPartUsageReportMocs.mocId })
      .from(buildMocPartUsageReportMocs)
      .where(eq(buildMocPartUsageReportMocs.reportId, reportId));
    const mocIds = members.map((m) => m.mocId);
    return recomputeAndPersistReport(reportId, mocIds);
  } catch {
    return { ok: false, error: "重算失败。" };
  }
}
