"use server";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { buildProfiles, buildSavedPartsSheets } from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import {
  BUILD_SUBJECT_MOC,
  BUILD_SUBJECT_SET,
  isSafeBuildSubjectId,
  type BuildSubjectKind,
} from "@/lib/build-subject";
import { MOC_PROFILE_MAX_DISPLAY_NAME, serializeTagsJson } from "@/lib/moc-profile-parse";
import {
  parseBuildDisplayNameFromFilename,
  parseMocSheetItems,
  parseStoredMocDualSheets,
  dualSheetsToPayloadV2,
  type StoredMocDualSheets,
} from "@/lib/parts-sheet-moc-id";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

const MAX_SUBJECT_ID_LEN = 128;
const MAX_ITEMS = 100_000;

function buildSheetKey(kind: BuildSubjectKind, subjectId: string) {
  return and(eq(buildSavedPartsSheets.subjectKind, kind), eq(buildSavedPartsSheets.subjectId, subjectId));
}

function buildProfileKey(kind: BuildSubjectKind, subjectId: string) {
  return and(eq(buildProfiles.subjectKind, kind), eq(buildProfiles.subjectId, subjectId));
}

/** 高砖缺件对照成功后写入；上传新的完整表时会在 {@link saveBuildPartsSheetToDb} 中清空。 */
export async function setGobricksShortageSyncAtInDb(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string,
  syncedAtIso: string
): Promise<void> {
  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) return;
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) return;
  const db = getDb();
  db.update(buildSavedPartsSheets)
    .set({ gobricksShortageSyncAt: syncedAtIso })
    .where(buildSheetKey(subjectKind, subjectId))
    .run();
}

export type InitialBuildSheetFromServer = {
  subjectId: string;
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  savedAt: string;
};

/** @deprecated 字段请用 {@link InitialBuildSheetFromServer.subjectId} */
export type InitialMocSheetFromServer = InitialBuildSheetFromServer;

export type BuildSheetBranchLoaded = {
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  savedAt: string;
  totalPartQty: number;
};

export type MocSheetBranchLoaded = BuildSheetBranchLoaded;

export type LoadBuildPartsSheetResult =
  | {
      ok: true;
      subjectKind: BuildSubjectKind;
      subjectId: string;
      full: BuildSheetBranchLoaded | null;
      shortage: BuildSheetBranchLoaded | null;
      /** 用户「标记为不缺」写入的 ISO 时间；无则 null */
      shortageClearedAt: string | null;
    }
  | { ok: false; error: string };

export type LoadMocPartsSheetResult = LoadBuildPartsSheetResult;

function branchTotals(items: ShortageResolveItem[]): number {
  return items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
}

function shortageSummaryColumns(dual: StoredMocDualSheets): {
  shortageLineCount: number | null;
  shortageTotalQty: number | null;
} {
  if (!dual.shortage) return { shortageLineCount: null, shortageTotalQty: null };
  const items = dual.shortage.items;
  return { shortageLineCount: items.length, shortageTotalQty: branchTotals(items) };
}

function toLoadedBranch(
  skippedHeader: boolean,
  items: ShortageResolveItem[],
  savedAt: string
): BuildSheetBranchLoaded {
  return {
    skippedHeader,
    items,
    savedAt,
    totalPartQty: branchTotals(items),
  };
}

function subjectKindLabel(kind: BuildSubjectKind): string {
  return kind === BUILD_SUBJECT_MOC ? "MOC" : "套装";
}

export async function buildHasSavedPartsSheet(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string
): Promise<boolean> {
  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) return false;
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) return false;
  try {
    const db = getDb();
    const rows = await db
      .select({ subjectId: buildSavedPartsSheets.subjectId })
      .from(buildSavedPartsSheets)
      .where(buildSheetKey(subjectKind, subjectId))
      .limit(1);
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

export async function mocHasSavedPartsSheet(mocIdRaw: string): Promise<boolean> {
  return buildHasSavedPartsSheet(BUILD_SUBJECT_MOC, mocIdRaw);
}

export async function loadBuildPartsSheetFromDb(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string
): Promise<LoadBuildPartsSheetResult> {
  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `请填写有效的 ${subjectKindLabel(subjectKind)} ID。` };
  }
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(subjectKind)} ID 含有非法字符。` };
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        payloadJson: buildSavedPartsSheets.payloadJson,
        shortageClearedAt: buildSavedPartsSheets.shortageClearedAt,
      })
      .from(buildSavedPartsSheets)
      .where(buildSheetKey(subjectKind, subjectId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return {
        ok: true,
        subjectKind,
        subjectId,
        full: null,
        shortage: null,
        shortageClearedAt: null,
      };
    }

    const clearedRaw = row.shortageClearedAt;
    const shortageClearedAt =
      typeof clearedRaw === "string" && clearedRaw.trim().length > 0 ? clearedRaw.trim() : null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payloadJson) as unknown;
    } catch {
      return { ok: false, error: "数据库中已存数据损坏，无法解析。" };
    }

    const dual = parseStoredMocDualSheets(parsed);
    if (!dual || (!dual.full && !dual.shortage)) {
      return { ok: false, error: "已存数据无效或为空。" };
    }

    return {
      ok: true,
      subjectKind,
      subjectId,
      full: dual.full
        ? toLoadedBranch(dual.full.skippedHeader, dual.full.items, dual.full.savedAt)
        : null,
      shortage: dual.shortage
        ? toLoadedBranch(dual.shortage.skippedHeader, dual.shortage.items, dual.shortage.savedAt)
        : null,
      shortageClearedAt,
    };
  } catch {
    return { ok: false, error: "读取数据库失败。" };
  }
}

export async function loadMocPartsSheetFromDb(mocIdRaw: string): Promise<LoadMocPartsSheetResult> {
  return loadBuildPartsSheetFromDb(BUILD_SUBJECT_MOC, mocIdRaw);
}

export type SaveBuildPartsSheetResult = { ok: true; savedAt: string } | { ok: false; error: string };

export type SaveMocPartsSheetResult = SaveBuildPartsSheetResult;

function aggregateRowFromDual(dual: StoredMocDualSheets): {
  skippedHeader: boolean;
  lineCount: number;
  totalPartQty: number;
} {
  const primary = dual.full ?? dual.shortage;
  if (!primary) {
    return { skippedHeader: false, lineCount: 0, totalPartQty: 0 };
  }
  return {
    skippedHeader: primary.skippedHeader,
    lineCount: primary.items.length,
    totalPartQty: branchTotals(primary.items),
  };
}

export async function saveBuildPartsSheetToDb(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  kind: "full" | "shortage";
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  /** 原始导入文件名：尚无显示名时写入 `build_profiles.display_name`（仅 kind=full） */
  sourceFileName?: string | null;
}): Promise<SaveBuildPartsSheetResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `主体 ID 须为非空且不超过 ${MAX_SUBJECT_ID_LEN} 字符。` };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }

  if (input.kind !== "full" && input.kind !== "shortage") {
    return { ok: false, error: "kind 须为 full 或 shortage。" };
  }

  if (input.subjectKind === BUILD_SUBJECT_SET && input.kind === "full") {
    return { ok: false, error: "套装不支持上传完整零件表，请以本地官方库存为准。" };
  }

  if (typeof input.skippedHeader !== "boolean") {
    return { ok: false, error: "skippedHeader 须为布尔值。" };
  }

  const items = parseMocSheetItems(input.items);
  if (!items || items.length === 0) {
    return { ok: false, error: "items 须为非空且格式正确的零件行数组。" };
  }
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: `行数超过上限 ${MAX_ITEMS}。` };
  }

  const savedAt = new Date().toISOString();
  const newBranch = {
    skippedHeader: input.skippedHeader,
    items,
    savedAt,
  };

  const rawSourceName = input.sourceFileName;
  const sourceFileName = typeof rawSourceName === "string" ? rawSourceName : "";
  const fromFileTitle =
    input.kind === "full" && sourceFileName.trim().length > 0
      ? parseBuildDisplayNameFromFilename(input.subjectKind, sourceFileName, subjectId)
          ?.trim()
          .slice(0, MOC_PROFILE_MAX_DISPLAY_NAME) ?? ""
      : "";

  try {
    const db = getDb();
    db.transaction((tx) => {
      const existingRows = tx
        .select({
          payloadJson: buildSavedPartsSheets.payloadJson,
          shortageClearedAt: buildSavedPartsSheets.shortageClearedAt,
        })
        .from(buildSavedPartsSheets)
        .where(buildSheetKey(input.subjectKind, subjectId))
        .limit(1)
        .all();
      const existingJson = existingRows[0]?.payloadJson;
      const rawCleared = existingRows[0]?.shortageClearedAt;
      const existingClearedAt =
        typeof rawCleared === "string" && rawCleared.trim().length > 0 ? rawCleared.trim() : null;
      let dual: StoredMocDualSheets = { full: null, shortage: null };
      if (existingJson) {
        try {
          const parsed = JSON.parse(existingJson) as unknown;
          const prev = parseStoredMocDualSheets(parsed);
          if (prev) dual = prev;
        } catch {
          /* 忽略损坏的旧行 */
        }
      }

      if (input.kind === "full") {
        dual = { ...dual, full: newBranch };
      } else {
        dual = { ...dual, shortage: newBranch };
      }

      if (!dual.full && !dual.shortage) {
        throw new Error("internal: empty dual");
      }

      const payload = dualSheetsToPayloadV2(dual);
      const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(dual);
      const shortageCols = shortageSummaryColumns(dual);
      const nextShortageClearedAt: string | null = dual.shortage ? null : existingClearedAt;

      tx.insert(buildSavedPartsSheets)
        .values({
          subjectKind: input.subjectKind,
          subjectId,
          skippedHeader,
          payloadJson: JSON.stringify(payload),
          lineCount,
          totalPartQty,
          updatedAt: savedAt,
          firstSavedAt: savedAt,
          shortageLineCount: shortageCols.shortageLineCount,
          shortageTotalQty: shortageCols.shortageTotalQty,
          shortageStatsOk: true,
          shortageClearedAt: nextShortageClearedAt,
        })
        .onConflictDoUpdate({
          target: [buildSavedPartsSheets.subjectKind, buildSavedPartsSheets.subjectId],
          set: {
            skippedHeader,
            payloadJson: JSON.stringify(payload),
            lineCount,
            totalPartQty,
            updatedAt: savedAt,
            shortageLineCount: shortageCols.shortageLineCount,
            shortageTotalQty: shortageCols.shortageTotalQty,
            shortageStatsOk: true,
            shortageClearedAt: nextShortageClearedAt,
            ...(input.kind === "full" ? { gobricksShortageSyncAt: null } : {}),
          },
        })
        .run();

      if (!fromFileTitle) return;

      const profRows = tx
        .select({ displayName: buildProfiles.displayName, tagsJson: buildProfiles.tagsJson })
        .from(buildProfiles)
        .where(buildProfileKey(input.subjectKind, subjectId))
        .limit(1)
        .all();
      const prof = profRows[0];
      if ((prof?.displayName ?? "").trim() !== "") return;

      tx.insert(buildProfiles)
        .values({
          subjectKind: input.subjectKind,
          subjectId,
          displayName: fromFileTitle,
          tagsJson: prof?.tagsJson ?? serializeTagsJson([]),
          profileUpdatedAt: savedAt,
        })
        .onConflictDoUpdate({
          target: [buildProfiles.subjectKind, buildProfiles.subjectId],
          set: {
            displayName: fromFileTitle,
            profileUpdatedAt: savedAt,
          },
        })
        .run();
    });

    revalidateBuildSubjectPaths(input.subjectKind, subjectId);
    return { ok: true, savedAt };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
}

export async function saveMocPartsSheetToDb(input: {
  mocId: string;
  kind: "full" | "shortage";
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  sourceFileName?: string | null;
}): Promise<SaveMocPartsSheetResult> {
  return saveBuildPartsSheetToDb({
    subjectKind: BUILD_SUBJECT_MOC,
    subjectId: input.mocId,
    kind: input.kind,
    skippedHeader: input.skippedHeader,
    items: input.items,
    sourceFileName: input.sourceFileName,
  });
}

export async function saveSetPartsSheetToDb(input: {
  setNum: string;
  kind: "full" | "shortage";
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  sourceFileName?: string | null;
}): Promise<SaveBuildPartsSheetResult> {
  return saveBuildPartsSheetToDb({
    subjectKind: BUILD_SUBJECT_SET,
    subjectId: input.setNum,
    kind: input.kind,
    skippedHeader: input.skippedHeader,
    items: input.items,
    sourceFileName: input.sourceFileName,
  });
}

/**
 * 在已有完整零件表的前提下移除缺件表分支，并清空「标记为不缺」时间戳（用于高砖查询结果为 0 条缺件）。
 */
export async function stripShortageBranchKeepingFullInDb(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
}): Promise<SaveBuildPartsSheetResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `主体 ID 须为非空且不超过 ${MAX_SUBJECT_ID_LEN} 字符。` };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }

  const savedAt = new Date().toISOString();
  const db = getDb();
  const existingRows = db
    .select({ payloadJson: buildSavedPartsSheets.payloadJson })
    .from(buildSavedPartsSheets)
    .where(buildSheetKey(input.subjectKind, subjectId))
    .limit(1)
    .all();
  const existingJson = existingRows[0]?.payloadJson;
  if (!existingJson) {
    return { ok: false, error: "尚无已保存的零件表记录。" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(existingJson) as unknown;
  } catch {
    return { ok: false, error: "数据库中已存数据损坏，无法解析。" };
  }
  const dual = parseStoredMocDualSheets(parsed);
  if (!dual?.full) {
    return { ok: false, error: "仅在有已存完整零件表时可清空缺件表。" };
  }

  const nextDual: StoredMocDualSheets = { ...dual, shortage: null };

  try {
    db.transaction((tx) => {
      const payload = dualSheetsToPayloadV2(nextDual);
      const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(nextDual);
      const shortageCols = shortageSummaryColumns(nextDual);

      tx.insert(buildSavedPartsSheets)
        .values({
          subjectKind: input.subjectKind,
          subjectId,
          skippedHeader,
          payloadJson: JSON.stringify(payload),
          lineCount,
          totalPartQty,
          updatedAt: savedAt,
          firstSavedAt: savedAt,
          shortageLineCount: shortageCols.shortageLineCount,
          shortageTotalQty: shortageCols.shortageTotalQty,
          shortageStatsOk: true,
          shortageClearedAt: null,
        })
        .onConflictDoUpdate({
          target: [buildSavedPartsSheets.subjectKind, buildSavedPartsSheets.subjectId],
          set: {
            skippedHeader,
            payloadJson: JSON.stringify(payload),
            lineCount,
            totalPartQty,
            updatedAt: savedAt,
            shortageLineCount: shortageCols.shortageLineCount,
            shortageTotalQty: shortageCols.shortageTotalQty,
            shortageStatsOk: true,
            shortageClearedAt: null,
          },
        })
        .run();
    });

    revalidateBuildSubjectPaths(input.subjectKind, subjectId);
    return { ok: true, savedAt };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
}

export type ClearBuildPartsSheetShortageResult =
  | { ok: true; code: "cleared" | "noop_no_shortage" | "noop_no_row" }
  | { ok: false; error: string };

/**
 * 清除已保存的缺件表（标记为无缺件）。
 * 若仍存有完整零件表则只去掉 shortage 一侧；若仅有缺件表则删除整条 `build_saved_parts_sheets` 记录。
 */
export async function clearBuildPartsSheetShortageInDb(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
}): Promise<ClearBuildPartsSheetShortageResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `主体 ID 须为非空且不超过 ${MAX_SUBJECT_ID_LEN} 字符。` };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }

  const db = getDb();
  const existingRows = db
    .select({ payloadJson: buildSavedPartsSheets.payloadJson })
    .from(buildSavedPartsSheets)
    .where(buildSheetKey(input.subjectKind, subjectId))
    .limit(1)
    .all();

  const existingJson = existingRows[0]?.payloadJson;
  if (!existingJson) {
    return { ok: true, code: "noop_no_row" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(existingJson) as unknown;
  } catch {
    return { ok: false, error: "数据库中已存数据损坏，无法解析。" };
  }

  const dual = parseStoredMocDualSheets(parsed);
  if (!dual) {
    return { ok: false, error: "已存数据无效，无法清除缺件表。" };
  }
  if (!dual.shortage) {
    const stamp = new Date().toISOString();
    try {
      getDb()
        .update(buildSavedPartsSheets)
        .set({ shortageClearedAt: stamp })
        .where(buildSheetKey(input.subjectKind, subjectId))
        .run();
      revalidateBuildSubjectPaths(input.subjectKind, subjectId);
    } catch {
      return { ok: false, error: "写入数据库失败。" };
    }
    return { ok: true, code: "noop_no_shortage" };
  }

  const savedAt = new Date().toISOString();
  const nextDual: StoredMocDualSheets = { ...dual, shortage: null };

  try {
    db.transaction((tx) => {
      if (!nextDual.full && !nextDual.shortage) {
        tx.delete(buildSavedPartsSheets).where(buildSheetKey(input.subjectKind, subjectId)).run();
        return;
      }

      const payload = dualSheetsToPayloadV2(nextDual);
      const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(nextDual);
      const shortageCols = shortageSummaryColumns(nextDual);

      tx.insert(buildSavedPartsSheets)
        .values({
          subjectKind: input.subjectKind,
          subjectId,
          skippedHeader,
          payloadJson: JSON.stringify(payload),
          lineCount,
          totalPartQty,
          updatedAt: savedAt,
          firstSavedAt: savedAt,
          shortageLineCount: shortageCols.shortageLineCount,
          shortageTotalQty: shortageCols.shortageTotalQty,
          shortageStatsOk: true,
          shortageClearedAt: savedAt,
        })
        .onConflictDoUpdate({
          target: [buildSavedPartsSheets.subjectKind, buildSavedPartsSheets.subjectId],
          set: {
            skippedHeader,
            payloadJson: JSON.stringify(payload),
            lineCount,
            totalPartQty,
            updatedAt: savedAt,
            shortageLineCount: shortageCols.shortageLineCount,
            shortageTotalQty: shortageCols.shortageTotalQty,
            shortageStatsOk: true,
            shortageClearedAt: savedAt,
          },
        })
        .run();
    });

    revalidateBuildSubjectPaths(input.subjectKind, subjectId);
    return { ok: true, code: "cleared" };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
}

export type CancelBuildPartsSheetShortageMarkResult = { ok: true } | { ok: false; error: string };

/** 仅清除「标记为不缺」的时间戳，不修改 payload 中的缺件表数据 */
export async function cancelBuildPartsSheetShortageMarkInDb(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
}): Promise<CancelBuildPartsSheetShortageMarkResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `主体 ID 须为非空且不超过 ${MAX_SUBJECT_ID_LEN} 字符。` };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }

  try {
    const db = getDb();
    const exists = db
      .select({ subjectId: buildSavedPartsSheets.subjectId })
      .from(buildSavedPartsSheets)
      .where(buildSheetKey(input.subjectKind, subjectId))
      .limit(1)
      .all();
    if (!exists[0]) {
      return { ok: false, error: "尚无已保存的零件表记录。" };
    }

    db.update(buildSavedPartsSheets)
      .set({ shortageClearedAt: null })
      .where(buildSheetKey(input.subjectKind, subjectId))
      .run();

    revalidateBuildSubjectPaths(input.subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
}
