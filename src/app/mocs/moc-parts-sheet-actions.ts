"use server";

import { and, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildProfiles, buildSavedPartsSheets } from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import {
  BUILD_SUBJECT_MOC,
  BUILD_SUBJECT_SET,
  isSafeBuildSubjectId,
  type BuildSubjectKind,
} from "@/lib/build-subject";
import { MOC_PROFILE_MAX_DISPLAY_NAME, serializeTagsJson } from "@/lib/moc-profile-parse";
import type { GobricksSheetSerializedRow } from "@/lib/gobricks-sheet-serialized-row";
import {
  parseBuildDisplayNameFromFilename,
  parseMocSheetItems,
  parseStoredMocDualSheets,
  dualSheetsToPayloadV2,
  type MocSheetBranchPayload,
  type StoredMocDualSheets,
} from "@/lib/parts-sheet-moc-id";
import { resolveGobricksSheetSerializedRowsInDb } from "@/lib/parts-sheet-resolve-csv-db";
import {
  listGobricksStockColorsForSheetReplaceAction,
  type SheetReplaceGobricksStockColor,
} from "@/app/mocs/sheet-row-replace-catalog-action";
import {
  parseGobricksProductIdFromGdsItemId,
  parseGdsColorSegmentFromGdsItemId,
} from "@/lib/gobricks-item-filter-inventory";
import {
  appendSheetRowReplacedMarker,
  mergeSheetRowReplaceSnapshotForPersist,
  parseSheetRowReplaceMeta,
  stripSheetRowReplacedMarker,
} from "@/lib/sheet-row-replaced-marker";
import { stripShortageReasonTextFromRest } from "@/lib/shortage-reason-filter";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

const MAX_SUBJECT_ID_LEN = 128;
const MAX_ITEMS = 100_000;

function buildSheetKey(kind: BuildSubjectKind, subjectId: string) {
  return and(eq(buildSavedPartsSheets.subjectKind, kind), eq(buildSavedPartsSheets.subjectId, subjectId));
}

function buildProfileKey(kind: BuildSubjectKind, subjectId: string) {
  return and(eq(buildProfiles.subjectKind, kind), eq(buildProfiles.subjectId, subjectId));
}

/** 高砖缺件对照成功后写入时间戳与整单 `gdsPrice`；上传新的完整表时会在 {@link saveBuildPartsSheetToDb} 中清空。 */
export async function setGobricksShortageSyncAtInDb(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string,
  syncedAtIso: string,
  gdsPriceCny: number
): Promise<void> {
  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) return;
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) return;
  const db = getUserDb();
  db.update(buildSavedPartsSheets)
    .set({
      gobricksShortageSyncAt: syncedAtIso,
      gobricksGdsPriceCny: Number.isFinite(gdsPriceCny) && gdsPriceCny >= 0 ? gdsPriceCny : 0,
    })
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
      fulfillment: BuildSheetBranchLoaded | null;
      /** 用户「标记为不缺」写入的 ISO 时间；无则 null */
      shortageClearedAt: string | null;
      /** 高砖整单参考价（元），来自接口根字段 `gdsPrice` 分片之和；未对照时为 null */
      gobricksGdsPriceCny: number | null;
      /** 最近一次高砖缺件/配货对照时间（分包批次等） */
      gobricksShortageSyncAt?: string | null;
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
    const db = getUserDb();
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

function normalizeLegacyGdsOnShortageFulfillmentItems(items: ShortageResolveItem[]): void {
  for (const it of items) {
    if ((it.gdsUnitPrice === undefined || it.gdsUnitPrice === null) && it.gobricksUnitPrice != null) {
      it.gdsUnitPrice = it.gobricksUnitPrice;
    }
  }
}

function trimmedSheetUnitPriceText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

/** 与列表/导出一致：优先 gds 单价，否则旧字段 gobricksUnitPrice */
function effectiveSheetRowUnitPriceForSerialize(
  row: Pick<ShortageResolveItem, "gdsUnitPrice" | "gobricksUnitPrice">
): string | null {
  return trimmedSheetUnitPriceText(row.gdsUnitPrice) ?? trimmedSheetUnitPriceText(row.gobricksUnitPrice);
}

const MAX_GDS_PICTURE_URL_LEN = 2048;

/** 选色步传入的高砖商品图 URL，写入 `gdsPicture` 前规范化 */
function trimGdsPictureForSheetSerialize(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  return t.length > MAX_GDS_PICTURE_URL_LEN ? t.slice(0, MAX_GDS_PICTURE_URL_LEN) : t;
}

/** 配货表行：高砖单价（元）× 数量之和，用于手动更换/还原后刷新 `gobricksGdsPriceCny`。 */
function sumGobricksFulfillmentSheetTotalCny(items: readonly ShortageResolveItem[] | undefined): number {
  if (!items?.length) return 0;
  let s = 0;
  for (const r of items) {
    const raw = ((r.gdsUnitPrice ?? r.gobricksUnitPrice) ?? "").trim().replace(/,/g, "");
    const u = Number(raw);
    if (!Number.isFinite(u) || u < 0) continue;
    const q = Number.isFinite(r.quantity) ? r.quantity : 0;
    if (!Number.isFinite(q) || q <= 0) continue;
    s += u * q;
  }
  return Math.round(s * 1e4) / 1e4;
}

function branchPayloadFromLoaded(loaded: BuildSheetBranchLoaded | null): MocSheetBranchPayload | null {
  if (!loaded) return null;
  return { skippedHeader: loaded.skippedHeader, items: loaded.items, savedAt: loaded.savedAt };
}

/**
 * 写入完整 dual payload，并按当前配货表行单价×数量更新 `gobricksGdsPriceCny`（不修改 `gobricksShortageSyncAt`）。
 */
async function persistStoredDualSheetsWithFulfillmentDerivedPrice(
  subjectKind: BuildSubjectKind,
  subjectId: string,
  dualIn: StoredMocDualSheets
): Promise<SaveBuildPartsSheetResult> {
  const savedAt = new Date().toISOString();

  const dualNorm: StoredMocDualSheets = { full: null, shortage: null, fulfillment: null };
  if (dualIn.full) {
    const items = parseMocSheetItems(dualIn.full.items);
    if (!items?.length) return { ok: false, error: "完整表数据无效。" };
    dualNorm.full = {
      skippedHeader: dualIn.full.skippedHeader,
      items,
      savedAt: dualIn.full.savedAt,
    };
  }
  if (dualIn.shortage) {
    const items = parseMocSheetItems(dualIn.shortage.items);
    if (!items?.length) dualNorm.shortage = null;
    else {
      normalizeLegacyGdsOnShortageFulfillmentItems(items);
      dualNorm.shortage = {
        skippedHeader: dualIn.shortage.skippedHeader,
        items,
        savedAt: dualIn.shortage.savedAt,
      };
    }
  }
  if (dualIn.fulfillment) {
    const items = parseMocSheetItems(dualIn.fulfillment.items);
    if (!items?.length) return { ok: false, error: "配货表须含至少一行有效数据。" };
    normalizeLegacyGdsOnShortageFulfillmentItems(items);
    dualNorm.fulfillment = {
      skippedHeader: dualIn.fulfillment.skippedHeader,
      items,
      savedAt: dualIn.fulfillment.savedAt,
    };
  }

  if (!dualNorm.full && !dualNorm.shortage && !dualNorm.fulfillment) {
    return { ok: false, error: "至少须保留一种零件表数据。" };
  }

  const fulfillmentTotalCny = sumGobricksFulfillmentSheetTotalCny(dualNorm.fulfillment?.items);
  const safePrice = Number.isFinite(fulfillmentTotalCny) && fulfillmentTotalCny >= 0 ? fulfillmentTotalCny : 0;

  try {
    const db = getUserDb();
    db.transaction((tx) => {
      const existingRows = tx
        .select({
          payloadJson: buildSavedPartsSheets.payloadJson,
          shortageClearedAt: buildSavedPartsSheets.shortageClearedAt,
        })
        .from(buildSavedPartsSheets)
        .where(buildSheetKey(subjectKind, subjectId))
        .limit(1)
        .all();
      const existingJson = existingRows[0]?.payloadJson;
      const rawCleared = existingRows[0]?.shortageClearedAt;
      const existingClearedAt =
        typeof rawCleared === "string" && rawCleared.trim().length > 0 ? rawCleared.trim() : null;

      const dual = dualNorm;
      const payload = dualSheetsToPayloadV2(dual);
      const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(dual);
      const shortageCols = shortageSummaryColumns(dual);
      const nextShortageClearedAt: string | null = dual.shortage ? null : existingClearedAt;

      tx.insert(buildSavedPartsSheets)
        .values({
          subjectKind,
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
          gobricksGdsPriceCny: safePrice,
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
            gobricksGdsPriceCny: safePrice,
          },
        })
        .run();
    });

    revalidateBuildSubjectPaths(subjectKind, subjectId);
    return { ok: true, savedAt };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
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
    const db = getUserDb();
    const rows = await db
      .select({
        payloadJson: buildSavedPartsSheets.payloadJson,
        shortageClearedAt: buildSavedPartsSheets.shortageClearedAt,
        gobricksGdsPriceCny: buildSavedPartsSheets.gobricksGdsPriceCny,
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
        fulfillment: null,
        shortageClearedAt: null,
        gobricksGdsPriceCny: null,
      };
    }

    const clearedRaw = row.shortageClearedAt;
    const shortageClearedAt =
      typeof clearedRaw === "string" && clearedRaw.trim().length > 0 ? clearedRaw.trim() : null;

    const rawGds = row.gobricksGdsPriceCny;
    const gobricksGdsPriceCny =
      typeof rawGds === "number" && Number.isFinite(rawGds) ? rawGds : null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payloadJson) as unknown;
    } catch {
      return { ok: false, error: "数据库中已存数据损坏，无法解析。" };
    }

    const dual = parseStoredMocDualSheets(parsed);
    if (!dual || (!dual.full && !dual.shortage && !dual.fulfillment)) {
      return { ok: false, error: "已存数据无效或为空。" };
    }

    if (dual.shortage?.items) normalizeLegacyGdsOnShortageFulfillmentItems(dual.shortage.items);
    if (dual.fulfillment?.items) normalizeLegacyGdsOnShortageFulfillmentItems(dual.fulfillment.items);

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
      fulfillment: dual.fulfillment
        ? toLoadedBranch(dual.fulfillment.skippedHeader, dual.fulfillment.items, dual.fulfillment.savedAt)
        : null,
      shortageClearedAt,
      gobricksGdsPriceCny,
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
  const primary = dual.full ?? dual.shortage ?? dual.fulfillment;
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
  kind: "full" | "shortage" | "fulfillment";
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

  if (input.kind !== "full" && input.kind !== "shortage" && input.kind !== "fulfillment") {
    return { ok: false, error: "kind 须为 full、shortage 或 fulfillment。" };
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
    const db = getUserDb();
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
      let dual: StoredMocDualSheets = { full: null, shortage: null, fulfillment: null };
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
        dual = { ...dual, full: newBranch, fulfillment: null };
      } else if (input.kind === "shortage") {
        dual = { ...dual, shortage: newBranch };
      } else {
        dual = { ...dual, fulfillment: newBranch };
      }

      if (!dual.full && !dual.shortage && !dual.fulfillment) {
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
            ...(input.kind === "full"
              ? { gobricksShortageSyncAt: null, gobricksGdsPriceCny: null }
              : {}),
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
  kind: "full" | "shortage" | "fulfillment";
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
  kind: "full" | "shortage" | "fulfillment";
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
  const db = getUserDb();
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

/**
 * 移除已存 JSON 中的配货表分支（`fulfillment`），保留完整表与缺件表。
 */
export async function clearFulfillmentBranchInDb(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
}): Promise<{ ok: true; savedAt: string } | { ok: false; error: string }> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `主体 ID 须为非空且不超过 ${MAX_SUBJECT_ID_LEN} 字符。` };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }

  const savedAt = new Date().toISOString();
  const db = getUserDb();
  const existingRows = db
    .select({
      payloadJson: buildSavedPartsSheets.payloadJson,
      shortageClearedAt: buildSavedPartsSheets.shortageClearedAt,
    })
    .from(buildSavedPartsSheets)
    .where(buildSheetKey(input.subjectKind, subjectId))
    .limit(1)
    .all();
  const existingJson = existingRows[0]?.payloadJson;
  if (!existingJson) {
    return { ok: false, error: "尚无已保存的零件表记录。" };
  }
  const rawCleared = existingRows[0]?.shortageClearedAt;
  const existingClearedAt =
    typeof rawCleared === "string" && rawCleared.trim().length > 0 ? rawCleared.trim() : null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(existingJson) as unknown;
  } catch {
    return { ok: false, error: "数据库中已存数据损坏，无法解析。" };
  }
  const dual = parseStoredMocDualSheets(parsed);
  if (!dual) {
    return { ok: false, error: "已存数据无效。" };
  }
  if (!dual.fulfillment) {
    return { ok: true, savedAt };
  }

  const nextDual: StoredMocDualSheets = { ...dual, fulfillment: null };
  if (!nextDual.full && !nextDual.shortage && !nextDual.fulfillment) {
    return { ok: false, error: "无法清空配货表：记录将无有效分支。" };
  }

  const nextShortageClearedAt: string | null = nextDual.shortage ? null : existingClearedAt;

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

  const db = getUserDb();
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
      db
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
      if (!nextDual.full && !nextDual.shortage && !nextDual.fulfillment) {
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
    const db = getUserDb();
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

export type ReplaceBuildPartsSheetRowResult = SaveBuildPartsSheetResult | { ok: false; error: string };

/**
 * 在已保存的配货表或缺件表中，将指定行更换为其他零件号与颜色（数量、备注与单价沿用原行；高砖商品图由选色步传入；其余高砖 SKU 等目录字段清空后对照写库）。
 */
export async function replaceBuildPartsSheetRowAction(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  branch: "fulfillment" | "shortage";
  lineNumber: number;
  partNum: string;
  colorId: number;
  /** 选色步高砖有货 SKU 的 `picture` 字段（商品图 URL），须与 `colorId` 对应 */
  gdsPicture?: string | null;
  /** 高砖商品 ID（如 GDS-656-072），与选色 SKU 一致 */
  gdsItemId?: string | null;
  gdsColorId?: string | null;
  /** 展示用商品名（可与零件名 + 色名组合） */
  gdsCaption?: string | null;
  /** 高砖侧乐高色 ID（字符串），通常与 `colorId` 一致 */
  gdsLegoColorId?: string | null;
  gdsColorNameZh?: string | null;
  gdsColorNameEn?: string | null;
  /** 选色 SKU 的高砖单价（元）；缺件并入配货时原行常无单价，须用此字段 */
  gdsUnitPrice?: string | null;
}): Promise<ReplaceBuildPartsSheetRowResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `主体 ID 须为非空且不超过 ${MAX_SUBJECT_ID_LEN} 字符。` };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }
  if (input.branch !== "fulfillment" && input.branch !== "shortage") {
    return { ok: false, error: "branch 须为 fulfillment 或 shortage。" };
  }
  if (!Number.isFinite(input.lineNumber) || input.lineNumber < 1) {
    return { ok: false, error: "行号无效。" };
  }
  if (!Number.isFinite(input.colorId)) {
    return { ok: false, error: "颜色 ID 无效。" };
  }

  const partNum = input.partNum.trim();
  if (!partNum) {
    return { ok: false, error: "零件号不能为空。" };
  }

  const loaded = await loadBuildPartsSheetFromDb(input.subjectKind, subjectId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  const branchData =
    input.branch === "fulfillment" ? loaded.fulfillment : loaded.shortage;
  if (!branchData) {
    return {
      ok: false,
      error: input.branch === "fulfillment" ? "尚无配货表。" : "尚无缺件表。",
    };
  }

  const idx = branchData.items.findIndex((r) => r.lineNumber === input.lineNumber);
  if (idx < 0) {
    return { ok: false, error: "找不到该行。" };
  }

  const old = branchData.items[idx];
  const gdsItemIdIn = input.gdsItemId?.trim() || null;
  const sameLegoPart = old.partNum === partNum && old.colorId === input.colorId;
  if (sameLegoPart) {
    const newSku = gdsItemIdIn?.trim();
    const oldSku = old.gdsItemId?.trim();
    const skuUnchanged =
      !newSku ||
      !oldSku ||
      normalizeSheetGdsItemIdForCompare(newSku) === normalizeSheetGdsItemIdForCompare(oldSku);
    if (skuUnchanged) {
      return { ok: false, error: "与当前行相同，无需更换。" };
    }
  }

  const meta = parseSheetRowReplaceMeta(old.rest);
  const preservedOriginal =
    meta.originalPartNum != null && meta.originalColorId != null
      ? { partNum: meta.originalPartNum, colorId: meta.originalColorId }
      : { partNum: old.partNum, colorId: old.colorId };
  const preservedSnapshot = mergeSheetRowReplaceSnapshotForPersist(meta, old);

  const preservedUnit = effectiveSheetRowUnitPriceForSerialize(old);
  const pickerUnit = trimmedSheetUnitPriceText(input.gdsUnitPrice);
  const unitPrice = pickerUnit ?? preservedUnit;
  const pickerGdsPicture = trimGdsPictureForSheetSerialize(input.gdsPicture);
  const gdsColorIdIn = input.gdsColorId?.trim() || null;
  const gdsCaptionIn = input.gdsCaption?.trim() || null;
  const gdsLegoColorIdIn = input.gdsLegoColorId?.trim() || null;

  const serialized: GobricksSheetSerializedRow = {
    partNum,
    colorId: input.colorId,
    quantity: old.quantity,
    rest: stripSheetRowReplacedMarker(old.rest),
    gobricksUnitPrice: unitPrice,
    gdsItemId: gdsItemIdIn,
    gdsColorId: gdsColorIdIn,
    gdsPicture: pickerGdsPicture,
    gdsUnitPrice: unitPrice,
    gdsCaption: gdsCaptionIn,
    gdsCaptionEn: null,
    gdsShelfState: null,
    gdsLegoColorId: gdsLegoColorIdIn ?? String(Math.trunc(input.colorId)),
    gdsColorNameZh: input.gdsColorNameZh?.trim() || null,
    gdsColorNameEn: input.gdsColorNameEn?.trim() || null,
  };

  const resolved = await resolveGobricksSheetSerializedRowsInDb([serialized]);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const newRow = resolved.items[0];
  if (!newRow) {
    return { ok: false, error: "目录对照失败。" };
  }

  const merged: ShortageResolveItem = {
    ...newRow,
    gdsColorNameZh: serialized.gdsColorNameZh ?? newRow.gdsColorNameZh ?? null,
    gdsColorNameEn: serialized.gdsColorNameEn ?? newRow.gdsColorNameEn ?? null,
    lineNumber: old.lineNumber,
    quantity: old.quantity,
    ...(unitPrice != null ? { gobricksUnitPrice: unitPrice, gdsUnitPrice: unitPrice } : {}),
    rest: appendSheetRowReplacedMarker(
      input.branch === "shortage" ? stripShortageReasonTextFromRest(old.rest) : old.rest,
      preservedOriginal,
      preservedSnapshot
    ),
  };

  const savedAt = new Date().toISOString();

  if (input.branch === "shortage") {
    const nextShortage = branchData.items.filter((_, i) => i !== idx);
    const ful = loaded.fulfillment;
    const baseFulfillmentItems = ful?.items ?? [];
    const nextLine =
      baseFulfillmentItems.length > 0
        ? Math.max(...baseFulfillmentItems.map((r) => r.lineNumber)) + 1
        : 1;
    const moved: ShortageResolveItem = { ...merged, lineNumber: nextLine };
    const fulfillmentItems = [...baseFulfillmentItems, moved];
    const dual: StoredMocDualSheets = {
      full: branchPayloadFromLoaded(loaded.full),
      shortage: nextShortage.length
        ? { skippedHeader: branchData.skippedHeader, items: nextShortage, savedAt }
        : null,
      fulfillment: {
        skippedHeader: ful?.skippedHeader ?? branchData.skippedHeader,
        items: fulfillmentItems,
        savedAt,
      },
    };
    return persistStoredDualSheetsWithFulfillmentDerivedPrice(input.subjectKind, subjectId, dual);
  }

  const nextFulfillment = [...branchData.items];
  nextFulfillment[idx] = merged;
  const dual: StoredMocDualSheets = {
    full: branchPayloadFromLoaded(loaded.full),
    shortage: branchPayloadFromLoaded(loaded.shortage),
    fulfillment: {
      skippedHeader: branchData.skippedHeader,
      items: nextFulfillment,
      savedAt,
    },
  };
  return persistStoredDualSheetsWithFulfillmentDerivedPrice(input.subjectKind, subjectId, dual);
}

function normalizeSheetGdsItemIdForCompare(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

/** 优先有货 + 乐高色；否则按快照 GDS SKU；再否则仅乐高色（可与 includeZeroInventory 配合） */
function pickGobricksStockForRestore(
  variants: SheetReplaceGobricksStockColor[],
  wantLegoColorId: number,
  originalGdsItemId: string | null,
): SheetReplaceGobricksStockColor | null {
  const want = Math.trunc(Number(wantLegoColorId));
  const strict = variants.find(
    (v) => Math.trunc(Number(v.colorId)) === want && Number(v.inventory) > 0
  );
  if (strict) return strict;

  const ogi = originalGdsItemId?.trim();
  if (ogi) {
    const n = normalizeSheetGdsItemIdForCompare(ogi);
    const bySku = variants.find((v) => normalizeSheetGdsItemIdForCompare(v.gdsItemId) === n);
    if (bySku) return bySku;
  }

  return variants.find((v) => Math.trunc(Number(v.colorId)) === want) ?? null;
}

/**
 * 将「更换零件」行还原为记录中的原零件号与颜色。
 * 优先用高砖有货列表；若无货则仍按原 GDS SKU / 快照解析还原（更换前能买到即可回写表内）。
 */
export async function restoreBuildPartsSheetRowAction(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  branch: "fulfillment" | "shortage";
  lineNumber: number;
}): Promise<ReplaceBuildPartsSheetRowResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: `主体 ID 须为非空且不超过 ${MAX_SUBJECT_ID_LEN} 字符。` };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }
  if (input.branch !== "fulfillment" && input.branch !== "shortage") {
    return { ok: false, error: "branch 须为 fulfillment 或 shortage。" };
  }
  if (!Number.isFinite(input.lineNumber) || input.lineNumber < 1) {
    return { ok: false, error: "行号无效。" };
  }

  const loaded = await loadBuildPartsSheetFromDb(input.subjectKind, subjectId);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error };
  }
  const branchData =
    input.branch === "fulfillment" ? loaded.fulfillment : loaded.shortage;
  if (!branchData) {
    return {
      ok: false,
      error: input.branch === "fulfillment" ? "尚无配货表。" : "尚无缺件表。",
    };
  }

  const idx = branchData.items.findIndex((r) => r.lineNumber === input.lineNumber);
  if (idx < 0) {
    return { ok: false, error: "找不到该行。" };
  }

  const old = branchData.items[idx];
  const meta = parseSheetRowReplaceMeta(old.rest);
  if (!meta.hasMarker) {
    return { ok: false, error: "本行无更换记录。" };
  }
  if (meta.originalPartNum == null || meta.originalColorId == null) {
    return { ok: false, error: "本行缺少保存的原零件信息，无法一键还原。" };
  }

  const partNum = meta.originalPartNum;
  const colorId = meta.originalColorId;
  if (old.partNum === partNum && old.colorId === colorId) {
    return { ok: false, error: "当前已是原零件，无需还原。" };
  }

  const wantColor = Math.trunc(Number(colorId));
  const originalGds = meta.originalGobricksItemId?.trim() || null;

  let stock = await listGobricksStockColorsForSheetReplaceAction({
    partNum,
    sheetRowPartNum: partNum,
    sheetRowGdsItemId: originalGds,
    probeLegoColorId: colorId,
  });
  if (!stock.ok) {
    return { ok: false, error: stock.error };
  }

  let hit = pickGobricksStockForRestore(stock.variants, wantColor, originalGds);

  if (!hit) {
    stock = await listGobricksStockColorsForSheetReplaceAction({
      partNum,
      sheetRowPartNum: partNum,
      sheetRowGdsItemId: originalGds,
      probeLegoColorId: colorId,
      includeZeroInventory: true,
    });
    if (!stock.ok) {
      return { ok: false, error: stock.error };
    }
    hit = pickGobricksStockForRestore(stock.variants, wantColor, originalGds);
  }

  let restoreGdsItemId: string;
  let restoreGdsColorId: string;
  let restoreGdsPicture: string | null;
  let restoreColorNameZh: string | null = meta.originalGobricksColorNameZh?.trim() || null;
  let restoreColorNameEn: string | null = meta.originalGobricksColorNameEn?.trim() || null;

  if (hit) {
    restoreGdsItemId = hit.gdsItemId;
    restoreGdsColorId = hit.gdsColorId;
    restoreGdsPicture = hit.picture?.trim() || null;
    restoreColorNameZh = restoreColorNameZh || hit.nameZh?.trim() || null;
    restoreColorNameEn = restoreColorNameEn || hit.nameEn?.trim() || null;
  } else if (originalGds && parseGobricksProductIdFromGdsItemId(originalGds)) {
    const gcd =
      parseGdsColorSegmentFromGdsItemId(originalGds) ?? meta.originalGobricksColorId?.trim() ?? null;
    if (!gcd) {
      return {
        ok: false,
        error:
          "高砖库存接口未返回该原 SKU，且无法从快照解析高砖色 ID。可稍后重试或在「更换零件」中手动改回原行。",
      };
    }
    restoreGdsItemId = originalGds;
    restoreGdsColorId = gcd;
    restoreGdsPicture = meta.originalGobricksPicture?.trim() || null;
  } else {
    return {
      ok: false,
      error: "高砖当前无该原零件此乐高色的有效库存，无法还原。可稍后重试或手动更换。",
    };
  }

  const cleanRest = stripSheetRowReplacedMarker(old.rest);
  const preservedUnit = effectiveSheetRowUnitPriceForSerialize(old);
  const snapshotUnit = trimmedSheetUnitPriceText(meta.originalGobricksUnitPrice);
  const restorePickerUnit = hit ? trimmedSheetUnitPriceText(hit.gdsUnitPrice) : null;
  const unitPrice = restorePickerUnit ?? snapshotUnit ?? preservedUnit;

  const serialized: GobricksSheetSerializedRow = {
    partNum,
    colorId,
    quantity: old.quantity,
    rest: cleanRest,
    gobricksUnitPrice: unitPrice,
    gdsItemId: restoreGdsItemId,
    gdsColorId: restoreGdsColorId,
    gdsPicture: restoreGdsPicture,
    gdsUnitPrice: unitPrice,
    gdsCaption: meta.originalGobricksCaption?.trim() || null,
    gdsCaptionEn: meta.originalGobricksCaptionEn?.trim() || null,
    gdsShelfState: null,
    gdsLegoColorId: String(colorId),
    gdsColorNameZh: restoreColorNameZh,
    gdsColorNameEn: restoreColorNameEn,
  };

  const resolved = await resolveGobricksSheetSerializedRowsInDb([serialized]);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }
  const newRow = resolved.items[0];
  if (!newRow) {
    return { ok: false, error: "目录对照失败。" };
  }

  const merged: ShortageResolveItem = {
    ...newRow,
    lineNumber: old.lineNumber,
    quantity: old.quantity,
    ...(unitPrice != null ? { gobricksUnitPrice: unitPrice, gdsUnitPrice: unitPrice } : {}),
    gdsCaption: serialized.gdsCaption ?? newRow.gdsCaption ?? null,
    gdsCaptionEn: serialized.gdsCaptionEn ?? newRow.gdsCaptionEn ?? null,
    gdsColorNameZh: serialized.gdsColorNameZh ?? newRow.gdsColorNameZh ?? null,
    gdsColorNameEn: serialized.gdsColorNameEn ?? newRow.gdsColorNameEn ?? null,
    rest: cleanRest,
  };

  const savedAt = new Date().toISOString();
  const nextItems = [...branchData.items];
  nextItems[idx] = merged;

  const dual: StoredMocDualSheets = {
    full: branchPayloadFromLoaded(loaded.full),
    shortage:
      input.branch === "shortage"
        ? { skippedHeader: branchData.skippedHeader, items: nextItems, savedAt }
        : branchPayloadFromLoaded(loaded.shortage),
    fulfillment:
      input.branch === "fulfillment"
        ? { skippedHeader: branchData.skippedHeader, items: nextItems, savedAt }
        : branchPayloadFromLoaded(loaded.fulfillment),
  };
  return persistStoredDualSheetsWithFulfillmentDerivedPrice(input.subjectKind, subjectId, dual);
}
