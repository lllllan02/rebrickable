import { and, asc, eq, inArray, or } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import {
  buildImages,
  buildOwnedSubjects,
  buildProfiles,
  buildSavedPartsSheets,
} from "@/db/schema";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { workflowStageFromRow } from "@/lib/build-workflow-from-row";
import type { BuildWorkflowStage } from "@/lib/build-workflow-stage";
import { parseTagsJson } from "@/lib/moc-profile-parse";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";

export function subjectIdFromListHref(href: string, segment: "mocs" | "sets"): string | null {
  try {
    const path = href.startsWith("http") ? new URL(href).pathname : href;
    const parts = path.split("/").filter(Boolean);
    const i = parts.indexOf(segment);
    if (i < 0 || !parts[i + 1]) return null;
    return decodeURIComponent(parts[i + 1]!);
  } catch {
    return null;
  }
}

/** 为搜索结果中的 MOC/套装行补齐与 `/mocs` 列表相同的数据源（零件表、资料、封面、进度） */
export async function enrichSearchSubjectHits(mocIds: string[], setNums: string[]) {
  const db = getUserDb();
  const sheetByKindId = new Map<
    string,
    {
      totalPartQty: number;
      updatedAt: string;
      shortageLineCount: number | null;
      shortageTotalQty: number | null;
      shortageClearedAt: string | null;
      gobricksShortageSyncAt: string | null;
      gobricksGdsPriceCny: number | null;
    }
  >();
  const mocWorkflowStage = new Map<string, BuildWorkflowStage>();
  const setWorkflowStage = new Map<string, BuildWorkflowStage>();
  const mocProfileById = new Map<
    string,
    { displayName: string; tags: string[]; hasInstructionsPdf: boolean; hasIoSource: boolean }
  >();
  const setProfileByNum = new Map<string, { displayName: string; tags: string[] }>();
  const mocCoverStored = new Map<string, string>();
  const setCoverStored = new Map<string, string>();
  let officialHeroBySet = new Map<string, string | null>();

  if (mocIds.length === 0 && setNums.length === 0) {
    return {
      sheetByKindId,
      mocWorkflowStage,
      setWorkflowStage,
      mocProfileById,
      setProfileByNum,
      mocCoverStored,
      setCoverStored,
      officialHeroBySet,
    };
  }

  const sheetOrs = [];
  if (mocIds.length > 0) {
    sheetOrs.push(
      and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC), inArray(buildSavedPartsSheets.subjectId, mocIds)),
    );
  }
  if (setNums.length > 0) {
    sheetOrs.push(
      and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_SET), inArray(buildSavedPartsSheets.subjectId, setNums)),
    );
  }
  const ownOrs = [];
  if (mocIds.length > 0) {
    ownOrs.push(
      and(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_MOC), inArray(buildOwnedSubjects.subjectId, mocIds)),
    );
  }
  if (setNums.length > 0) {
    ownOrs.push(
      and(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_SET), inArray(buildOwnedSubjects.subjectId, setNums)),
    );
  }

  const [sheetRows, ownRows, mocProfRows, setProfRows, mocImgRows, setImgRows] = await Promise.all([
    sheetOrs.length > 0 ? db.select().from(buildSavedPartsSheets).where(or(...sheetOrs)) : Promise.resolve([]),
    ownOrs.length > 0 ? db.select().from(buildOwnedSubjects).where(or(...ownOrs)) : Promise.resolve([]),
    mocIds.length > 0
      ? db
          .select()
          .from(buildProfiles)
          .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), inArray(buildProfiles.subjectId, mocIds)))
      : Promise.resolve([]),
    setNums.length > 0
      ? db
          .select()
          .from(buildProfiles)
          .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_SET), inArray(buildProfiles.subjectId, setNums)))
      : Promise.resolve([]),
    mocIds.length > 0
      ? db
          .select({
            subjectId: buildImages.subjectId,
            storedFile: buildImages.storedFile,
            createdAt: buildImages.createdAt,
          })
          .from(buildImages)
          .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), inArray(buildImages.subjectId, mocIds)))
          .orderBy(asc(buildImages.createdAt))
      : Promise.resolve([]),
    setNums.length > 0
      ? db
          .select({
            subjectId: buildImages.subjectId,
            storedFile: buildImages.storedFile,
            createdAt: buildImages.createdAt,
          })
          .from(buildImages)
          .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_SET), inArray(buildImages.subjectId, setNums)))
          .orderBy(asc(buildImages.createdAt))
      : Promise.resolve([]),
  ]);

  if (setNums.length > 0) {
    officialHeroBySet = await batchSetCatalogHeroUrls(setNums);
  }

  for (const row of sheetRows) {
    sheetByKindId.set(`${row.subjectKind}:${row.subjectId}`, {
      totalPartQty: row.totalPartQty,
      updatedAt: row.updatedAt,
      shortageLineCount: row.shortageLineCount ?? null,
      shortageTotalQty: row.shortageTotalQty ?? null,
      shortageClearedAt: row.shortageClearedAt ?? null,
      gobricksShortageSyncAt: row.gobricksShortageSyncAt ?? null,
      gobricksGdsPriceCny:
        typeof row.gobricksGdsPriceCny === "number" && Number.isFinite(row.gobricksGdsPriceCny)
          ? row.gobricksGdsPriceCny
          : null,
    });
  }
  for (const o of ownRows as { subjectKind: string; subjectId: string; workflowStage: string }[]) {
    const stage = workflowStageFromRow(o);
    if (!stage) continue;
    if (o.subjectKind === BUILD_SUBJECT_MOC) mocWorkflowStage.set(o.subjectId, stage);
    else if (o.subjectKind === BUILD_SUBJECT_SET) setWorkflowStage.set(o.subjectId, stage);
  }
  for (const p of mocProfRows as (typeof buildProfiles.$inferSelect)[]) {
    mocProfileById.set(p.subjectId, {
      displayName: (p.displayName ?? "").trim(),
      tags: parseTagsJson(p.tagsJson),
      hasInstructionsPdf: Boolean(p.hasInstructionsPdf),
      hasIoSource: Boolean(p.hasIoSource),
    });
  }
  for (const p of setProfRows as (typeof buildProfiles.$inferSelect)[]) {
    setProfileByNum.set(p.subjectId, {
      displayName: (p.displayName ?? "").trim(),
      tags: parseTagsJson(p.tagsJson),
    });
  }
  for (const im of mocImgRows as { subjectId: string; storedFile: string }[]) {
    if (!mocCoverStored.has(im.subjectId)) mocCoverStored.set(im.subjectId, im.storedFile);
  }
  for (const im of setImgRows as { subjectId: string; storedFile: string }[]) {
    if (!setCoverStored.has(im.subjectId)) setCoverStored.set(im.subjectId, im.storedFile);
  }

  return {
    sheetByKindId,
    mocWorkflowStage,
    setWorkflowStage,
    mocProfileById,
    setProfileByNum,
    mocCoverStored,
    setCoverStored,
    officialHeroBySet,
  };
}
