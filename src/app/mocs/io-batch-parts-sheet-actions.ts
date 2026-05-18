"use server";

import { and, asc, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildIoStepBatches } from "@/db/schema";
import { revalidateIoBatchPaths, revalidateMocIoSplitPaths } from "@/lib/build-revalidate-paths";
// revalidateMocIoSplitPaths used by deleteIoStepBatchesForMoc
import {
  BUILD_SUBJECT_MOC,
  isSafeBuildSubjectId,
  type BuildSubjectKind,
} from "@/lib/build-subject";
import {
  dualSheetsToPayloadV2,
  parseMocSheetItems,
  parseStoredMocDualSheets,
  type MocSheetBranchPayload,
  type StoredMocDualSheets,
} from "@/lib/parts-sheet-moc-id";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";
import { restHasSheetRowReplacedMarker } from "@/lib/sheet-row-replaced-marker";
import type { IoSplitSheetRowProvenance } from "@/lib/io-split-sheet-cache";

import { buildAttachments } from "@/db/schema";
import { sumPartsSheetGobricksTotalCny } from "@/lib/parts-sheet-gobricks-price";
import { formatIoSplitConfigSummary, parseIoSplitConfigJson } from "@/lib/studio-io-split";

import type { BuildSheetBranchLoaded, InitialBuildSheetFromServer, LoadBuildPartsSheetResult } from "./moc-parts-sheet-actions";

const MAX_SUBJECT_ID_LEN = 128;
const MAX_ITEMS = 100_000;

function batchKey(batchId: number) {
  return eq(buildIoStepBatches.id, batchId);
}

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

function aggregateRowFromDual(dual: StoredMocDualSheets): {
  skippedHeader: boolean;
  lineCount: number;
  totalPartQty: number;
} {
  const branch = dual.full ?? dual.shortage ?? dual.fulfillment;
  if (!branch) throw new Error("empty dual");
  return {
    skippedHeader: branch.skippedHeader,
    lineCount: branch.items.length,
    totalPartQty: branchTotals(branch.items),
  };
}

function branchLoaded(branch: MocSheetBranchPayload): BuildSheetBranchLoaded {
  return {
    skippedHeader: branch.skippedHeader,
    items: branch.items,
    savedAt: branch.savedAt,
    totalPartQty: branchTotals(branch.items),
  };
}

export type IoBatchListRow = {
  id: number;
  label: string;
  sortOrder: number;
  splitMode: string;
  mainStepFrom: number;
  mainStepTo: number;
  lineCount: number;
  totalPartQty: number;
  updatedAt: string;
  /** 高砖配货参考总价（元）；未对照高砖时为 null */
  gobricksGdsPriceCny: number | null;
};

export type IoSplitPlanGroup = {
  groupKey: string;
  ruleLabel: string;
  attachmentId: number;
  attachmentName: string;
  splitMode: string;
  splitConfigJson: string;
  splitConfigSummary: string;
  updatedAt: string;
  batches: IoBatchListRow[];
};

function planGroupKey(attachmentId: number, ruleLabel: string, splitConfigJson: string): string {
  return `${attachmentId}\x1f${ruleLabel}\x1f${splitConfigJson}`;
}

export async function listIoStepBatchesForMoc(mocId: string): Promise<IoBatchListRow[]> {
  const id = mocId.trim();
  if (!id || !isSafeBuildSubjectId(BUILD_SUBJECT_MOC, id)) return [];
  const db = getUserDb();
  const rows = await db
    .select({
      id: buildIoStepBatches.id,
      label: buildIoStepBatches.label,
      sortOrder: buildIoStepBatches.sortOrder,
      splitMode: buildIoStepBatches.splitMode,
      mainStepFrom: buildIoStepBatches.mainStepFrom,
      mainStepTo: buildIoStepBatches.mainStepTo,
      lineCount: buildIoStepBatches.lineCount,
      totalPartQty: buildIoStepBatches.totalPartQty,
      updatedAt: buildIoStepBatches.updatedAt,
      gobricksGdsPriceCny: buildIoStepBatches.gobricksGdsPriceCny,
    })
    .from(buildIoStepBatches)
    .where(
      and(eq(buildIoStepBatches.subjectKind, BUILD_SUBJECT_MOC), eq(buildIoStepBatches.subjectId, id))
    )
    .orderBy(asc(buildIoStepBatches.sortOrder), asc(buildIoStepBatches.id));
  return rows.map((r) => ({
    ...r,
    gobricksGdsPriceCny:
      typeof r.gobricksGdsPriceCny === "number" && Number.isFinite(r.gobricksGdsPriceCny) && r.gobricksGdsPriceCny >= 0
        ? r.gobricksGdsPriceCny
        : null,
  }));
}

export async function listIoSplitPlanGroupsForMoc(mocId: string): Promise<IoSplitPlanGroup[]> {
  const id = mocId.trim();
  if (!id || !isSafeBuildSubjectId(BUILD_SUBJECT_MOC, id)) return [];
  const db = getUserDb();
  const rows = await db
    .select({
      id: buildIoStepBatches.id,
      attachmentId: buildIoStepBatches.attachmentId,
      ruleLabel: buildIoStepBatches.ruleLabel,
      label: buildIoStepBatches.label,
      sortOrder: buildIoStepBatches.sortOrder,
      splitMode: buildIoStepBatches.splitMode,
      splitConfigJson: buildIoStepBatches.splitConfigJson,
      mainStepFrom: buildIoStepBatches.mainStepFrom,
      mainStepTo: buildIoStepBatches.mainStepTo,
      lineCount: buildIoStepBatches.lineCount,
      totalPartQty: buildIoStepBatches.totalPartQty,
      updatedAt: buildIoStepBatches.updatedAt,
      gobricksGdsPriceCny: buildIoStepBatches.gobricksGdsPriceCny,
    })
    .from(buildIoStepBatches)
    .where(
      and(eq(buildIoStepBatches.subjectKind, BUILD_SUBJECT_MOC), eq(buildIoStepBatches.subjectId, id))
    )
    .orderBy(asc(buildIoStepBatches.attachmentId), asc(buildIoStepBatches.ruleLabel), asc(buildIoStepBatches.sortOrder));

  if (rows.length === 0) return [];

  const attIds = [...new Set(rows.map((r) => r.attachmentId))];
  const attRows = await db
    .select({
      id: buildAttachments.id,
      originalName: buildAttachments.originalName,
      storedFile: buildAttachments.storedFile,
    })
    .from(buildAttachments)
    .where(
      and(eq(buildAttachments.subjectKind, BUILD_SUBJECT_MOC), eq(buildAttachments.subjectId, id))
    );
  const attName = new Map<number, string>();
  for (const a of attRows) {
    attName.set(a.id, (a.originalName ?? "").trim() || a.storedFile);
  }

  const map = new Map<string, IoSplitPlanGroup>();
  for (const r of rows) {
    const ruleLabel = (r.ruleLabel ?? "").trim();
    const key = planGroupKey(r.attachmentId, ruleLabel, r.splitConfigJson);
    const config = parseIoSplitConfigJson(r.splitConfigJson);
    const splitConfigSummary = config ? formatIoSplitConfigSummary(config) : r.splitMode;
    let group = map.get(key);
    if (!group) {
      group = {
        groupKey: key,
        ruleLabel,
        attachmentId: r.attachmentId,
        attachmentName: attName.get(r.attachmentId) ?? `附件 #${r.attachmentId}`,
        splitMode: r.splitMode,
        splitConfigJson: r.splitConfigJson,
        splitConfigSummary,
        updatedAt: r.updatedAt,
        batches: [],
      };
      map.set(key, group);
    }
    if (r.updatedAt > group.updatedAt) group.updatedAt = r.updatedAt;
    group.batches.push({
      id: r.id,
      label: r.label,
      sortOrder: r.sortOrder,
      splitMode: r.splitMode,
      mainStepFrom: r.mainStepFrom,
      mainStepTo: r.mainStepTo,
      lineCount: r.lineCount,
      totalPartQty: r.totalPartQty,
      updatedAt: r.updatedAt,
      gobricksGdsPriceCny:
        typeof r.gobricksGdsPriceCny === "number" &&
        Number.isFinite(r.gobricksGdsPriceCny) &&
        r.gobricksGdsPriceCny >= 0
          ? r.gobricksGdsPriceCny
          : null,
    });
  }

  return [...map.values()].sort((a, b) => {
    const an = a.attachmentName.localeCompare(b.attachmentName, "zh");
    if (an !== 0) return an;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function mergeShortageItemsWithProvenance(
  lists: { batchId: number; items: ShortageResolveItem[] }[]
): {
  items: ShortageResolveItem[];
  shortageProvenanceByLine: Record<number, IoSplitSheetRowProvenance[]>;
} {
  const merged = new Map<
    string,
    { item: ShortageResolveItem; sources: IoSplitSheetRowProvenance[] }
  >();
  let lineNumber = 0;

  for (const { batchId, items } of lists) {
    for (const item of items) {
      const key = `${item.partNum}\t${item.colorId}`;
      const source: IoSplitSheetRowProvenance = {
        batchId,
        sourceLineNumber: item.lineNumber,
      };
      const cur = merged.get(key);
      if (cur) {
        cur.item.quantity += item.quantity;
        cur.sources.push(source);
      } else {
        lineNumber += 1;
        merged.set(key, {
          item: { ...item, lineNumber },
          sources: [source],
        });
      }
    }
  }

  const items: ShortageResolveItem[] = [];
  const shortageProvenanceByLine: Record<number, IoSplitSheetRowProvenance[]> = {};
  for (const { item, sources } of merged.values()) {
    items.push(item);
    shortageProvenanceByLine[item.lineNumber] = sources;
  }
  return { items, shortageProvenanceByLine };
}

/** 详情页内嵌查看某一分步包的完整零件表 */
export async function fetchIoBatchFullSheetAction(batchId: number): Promise<
  | {
      ok: true;
      items: ShortageResolveItem[];
      skippedHeader: boolean;
      savedAt: string | null;
    }
  | { ok: false; error: string }
> {
  const r = await loadIoBatchPartsSheetFromDb(batchId);
  if (!r.ok) return r;
  if (!r.full?.items.length) {
    return { ok: false, error: "该包尚无完整零件表。" };
  }
  return {
    ok: true,
    items: r.full.items,
    skippedHeader: r.full.skippedHeader,
    savedAt: r.full.savedAt,
  };
}

/** 详情页内嵌查看某一分步包的配货表 */
export async function fetchIoBatchFulfillmentSheetAction(batchId: number): Promise<
  | {
      ok: true;
      items: ShortageResolveItem[];
      skippedHeader: boolean;
      savedAt: string | null;
    }
  | { ok: false; error: string }
> {
  const r = await loadIoBatchPartsSheetFromDb(batchId);
  if (!r.ok) return r;
  if (!r.fulfillment?.items.length) {
    return {
      ok: false,
      error:
        r.gobricksShortageSyncAt != null || r.gobricksGdsPriceCny != null
          ? "高砖未返回该包可购零件行。"
          : "该包尚无高砖零件数据，请保存分包后自动同步或使用「从高砖同步」。",
    };
  }
  return {
    ok: true,
    items: r.fulfillment.items,
    skippedHeader: r.fulfillment.skippedHeader,
    savedAt: r.fulfillment.savedAt,
  };
}

/** 详情页内嵌查看某一分步包的缺件表 */
export async function fetchIoBatchShortageSheetAction(batchId: number): Promise<
  | {
      ok: true;
      items: ShortageResolveItem[];
      skippedHeader: boolean;
      savedAt: string | null;
    }
  | { ok: false; error: string }
> {
  const r = await loadIoBatchPartsSheetFromDb(batchId);
  if (!r.ok) return r;
  if (!r.shortage?.items.length) {
    return { ok: false, error: "该包尚无缺件表，可在分包详情页从高砖同步。" };
  }
  return {
    ok: true,
    items: r.shortage.items,
    skippedHeader: r.shortage.skippedHeader,
    savedAt: r.shortage.savedAt,
  };
}

/** 方案内各包缺件表合并（按零件+颜色累加数量） */
export async function fetchIoPlanMergedShortageAction(batchIds: number[]): Promise<
  | {
      ok: true;
      items: ShortageResolveItem[];
      skippedHeader: boolean;
      savedAt: string | null;
      shortageProvenanceByLine: Record<number, IoSplitSheetRowProvenance[]>;
    }
  | { ok: false; error: string }
> {
  const ids = batchIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return { ok: false, error: "无有效分包。" };

  const lists: { batchId: number; items: ShortageResolveItem[] }[] = [];
  let latestSavedAt: string | null = null;
  let skippedHeader = true;

  for (const id of ids) {
    const r = await loadIoBatchPartsSheetFromDb(id);
    if (!r.ok || !r.shortage?.items.length) continue;
    lists.push({ batchId: id, items: r.shortage.items });
    skippedHeader = skippedHeader && r.shortage.skippedHeader;
    if (r.shortage.savedAt && (!latestSavedAt || r.shortage.savedAt > latestSavedAt)) {
      latestSavedAt = r.shortage.savedAt;
    }
  }

  if (lists.length === 0) {
    return {
      ok: false,
      error: "该方案下各包尚无缺件表，请进入各分包后使用「从高砖同步」生成缺件数据。",
    };
  }

  const { items, shortageProvenanceByLine } = mergeShortageItemsWithProvenance(lists);
  return {
    ok: true,
    items,
    skippedHeader,
    savedAt: latestSavedAt,
    shortageProvenanceByLine,
  };
}

/** 单包配货表中经「更换零件」写入的行（修改表） */
export async function fetchIoBatchModifiedSheetAction(batchId: number): Promise<
  | {
      ok: true;
      items: ShortageResolveItem[];
      skippedHeader: boolean;
      savedAt: string | null;
    }
  | { ok: false; error: string }
> {
  const r = await fetchIoBatchFulfillmentSheetAction(batchId);
  if (!r.ok) return r;
  const items = r.items.filter((row) => restHasSheetRowReplacedMarker(row.rest));
  if (items.length === 0) {
    return { ok: false, error: "该包尚无修改记录；可在缺件表中更换零件后在此查看。" };
  }
  return {
    ok: true,
    items,
    skippedHeader: r.skippedHeader,
    savedAt: r.savedAt,
  };
}

/** 方案内各包修改表合并（不合并数量，保留源分包行映射） */
export async function fetchIoPlanMergedModifiedAction(batchIds: number[]): Promise<
  | {
      ok: true;
      items: ShortageResolveItem[];
      skippedHeader: boolean;
      savedAt: string | null;
      replaceProvenanceByLine: Record<number, IoSplitSheetRowProvenance>;
    }
  | { ok: false; error: string }
> {
  const ids = batchIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return { ok: false, error: "无有效分包。" };

  const items: ShortageResolveItem[] = [];
  const replaceProvenanceByLine: Record<number, IoSplitSheetRowProvenance> = {};
  let latestSavedAt: string | null = null;
  let skippedHeader = true;
  let lineNumber = 0;

  for (const id of ids) {
    const r = await loadIoBatchPartsSheetFromDb(id);
    if (!r.ok || !r.fulfillment?.items.length) continue;
    skippedHeader = skippedHeader && r.fulfillment.skippedHeader;
    if (r.fulfillment.savedAt && (!latestSavedAt || r.fulfillment.savedAt > latestSavedAt)) {
      latestSavedAt = r.fulfillment.savedAt;
    }
    for (const row of r.fulfillment.items) {
      if (!restHasSheetRowReplacedMarker(row.rest)) continue;
      lineNumber += 1;
      items.push({ ...row, lineNumber });
      replaceProvenanceByLine[lineNumber] = {
        batchId: id,
        sourceLineNumber: row.lineNumber,
      };
    }
  }

  if (items.length === 0) {
    return {
      ok: false,
      error: "该方案下尚无修改记录；请在各分包缺件表中更换零件，修改行将汇总到此表。",
    };
  }

  return {
    ok: true,
    items,
    skippedHeader,
    savedAt: latestSavedAt,
    replaceProvenanceByLine,
  };
}

export async function loadIoBatchPartsSheetFromDb(
  batchId: number
): Promise<LoadBuildPartsSheetResult & { batchLabel?: string; parentMocId?: string }> {
  if (!Number.isFinite(batchId) || batchId < 1) {
    return { ok: false, error: "批次 ID 无效。" };
  }
  const db = getUserDb();
  const rows = await db.select().from(buildIoStepBatches).where(batchKey(batchId)).limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "未找到该分步零件表批次。" };

  let dual: StoredMocDualSheets | null = null;
  try {
    dual = parseStoredMocDualSheets(JSON.parse(row.payloadJson));
  } catch {
    return { ok: false, error: "批次数据损坏。" };
  }
  if (!dual) return { ok: false, error: "批次数据格式无效。" };

  return {
    ok: true,
    subjectKind: BUILD_SUBJECT_MOC,
    subjectId: row.subjectId,
    full: dual.full ? branchLoaded(dual.full) : null,
    shortage: dual.shortage ? branchLoaded(dual.shortage) : null,
    fulfillment: dual.fulfillment ? branchLoaded(dual.fulfillment) : null,
    shortageClearedAt: row.shortageClearedAt,
    gobricksGdsPriceCny: row.gobricksGdsPriceCny,
    gobricksShortageSyncAt: row.gobricksShortageSyncAt,
    batchLabel: row.label,
    parentMocId: row.subjectId,
  };
}

export type SaveIoBatchPartsSheetResult = { ok: true; savedAt: string } | { ok: false; error: string };

export type PersistIoBatchDualResult = { ok: true; savedAt: string } | { ok: false; error: string };

/** 写入分包 dual payload（更换/还原零件、高砖同步后整表更新） */
export async function persistIoBatchStoredDualSheets(
  batchId: number,
  dualIn: StoredMocDualSheets
): Promise<PersistIoBatchDualResult> {
  if (!Number.isFinite(batchId) || batchId < 1) {
    return { ok: false, error: "批次 ID 无效。" };
  }

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
    dualNorm.fulfillment = {
      skippedHeader: dualIn.fulfillment.skippedHeader,
      items,
      savedAt: dualIn.fulfillment.savedAt,
    };
  }

  if (!dualNorm.full && !dualNorm.shortage && !dualNorm.fulfillment) {
    return { ok: false, error: "至少须保留一种零件表数据。" };
  }

  const savedAt = new Date().toISOString();
  const fulfillmentTotalCny = sumPartsSheetGobricksTotalCny(dualNorm.fulfillment?.items);
  const safePrice = Number.isFinite(fulfillmentTotalCny) && fulfillmentTotalCny >= 0 ? fulfillmentTotalCny : 0;

  const db = getUserDb();
  const rows = await db.select().from(buildIoStepBatches).where(batchKey(batchId)).limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "未找到批次。" };

  const payload = dualSheetsToPayloadV2(dualNorm);
  const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(dualNorm);
  const shortageCols = shortageSummaryColumns(dualNorm);
  const nextShortageClearedAt: string | null = dualNorm.shortage ? null : row.shortageClearedAt;

  try {
    db.update(buildIoStepBatches)
      .set({
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
      })
      .where(batchKey(batchId))
      .run();

    revalidateIoBatchPaths(row.subjectId, batchId);
    return { ok: true, savedAt };
  } catch {
    return { ok: false, error: "写入失败。" };
  }
}

export async function saveIoBatchPartsSheetToDb(input: {
  batchId: number;
  kind: "full" | "shortage" | "fulfillment";
  skippedHeader: boolean;
  items: ShortageResolveItem[];
}): Promise<SaveIoBatchPartsSheetResult> {
  if (!Number.isFinite(input.batchId) || input.batchId < 1) {
    return { ok: false, error: "批次 ID 无效。" };
  }
  const items = parseMocSheetItems(input.items);
  if (!items || items.length === 0) {
    return { ok: false, error: "items 须为非空数组。" };
  }
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: `行数超过上限 ${MAX_ITEMS}。` };
  }

  const savedAt = new Date().toISOString();
  const newBranch: MocSheetBranchPayload = {
    skippedHeader: input.skippedHeader,
    items,
    savedAt,
  };

  const db = getUserDb();
  const rows = await db.select().from(buildIoStepBatches).where(batchKey(input.batchId)).limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: "未找到批次。" };

  let dual: StoredMocDualSheets = { full: null, shortage: null, fulfillment: null };
  try {
    dual = parseStoredMocDualSheets(JSON.parse(row.payloadJson)) ?? dual;
  } catch {
    /* 重置 */
  }

  if (input.kind === "full") {
    dual = { ...dual, full: newBranch, fulfillment: null };
  } else if (input.kind === "shortage") {
    dual = { ...dual, shortage: newBranch };
  } else {
    dual = { ...dual, fulfillment: newBranch };
  }

  if (!dual.full && !dual.shortage && !dual.fulfillment) {
    return { ok: false, error: "无有效分支。" };
  }

  const payload = dualSheetsToPayloadV2(dual);
  const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(dual);
  const shortageCols = shortageSummaryColumns(dual);
  const nextShortageClearedAt: string | null = dual.shortage ? null : row.shortageClearedAt;

  try {
    db.update(buildIoStepBatches)
      .set({
        skippedHeader,
        payloadJson: JSON.stringify(payload),
        lineCount,
        totalPartQty,
        updatedAt: savedAt,
        shortageLineCount: shortageCols.shortageLineCount,
        shortageTotalQty: shortageCols.shortageTotalQty,
        shortageStatsOk: true,
        shortageClearedAt: nextShortageClearedAt,
        ...(input.kind === "full" ? { gobricksShortageSyncAt: null, gobricksGdsPriceCny: null } : {}),
      })
      .where(batchKey(input.batchId))
      .run();

    revalidateIoBatchPaths(row.subjectId, input.batchId);
    return { ok: true, savedAt };
  } catch {
    return { ok: false, error: "写入失败。" };
  }
}

export async function setGobricksShortageSyncAtForIoBatch(
  batchId: number,
  syncedAtIso: string,
  gdsPriceCny: number
): Promise<void> {
  if (!Number.isFinite(batchId) || batchId < 1) return;
  const db = getUserDb();
  const row = await db.select({ subjectId: buildIoStepBatches.subjectId }).from(buildIoStepBatches).where(batchKey(batchId)).limit(1);
  if (!row[0]) return;
  db.update(buildIoStepBatches)
    .set({
      gobricksShortageSyncAt: syncedAtIso,
      gobricksGdsPriceCny: Number.isFinite(gdsPriceCny) && gdsPriceCny >= 0 ? gdsPriceCny : 0,
    })
    .where(batchKey(batchId))
    .run();
  revalidateIoBatchPaths(row[0].subjectId, batchId);
}

export type DeleteIoSplitPlanGroupResult = { ok: true; deletedBatchCount: number } | { ok: false; error: string };

/** 删除一整套分包方案（同附件 + 方案名 + 拆分配置下的全部分包） */
export async function deleteIoSplitPlanGroupAction(input: {
  mocId: string;
  groupKey: string;
}): Promise<DeleteIoSplitPlanGroupResult> {
  const mocId = input.mocId.trim();
  if (!mocId || !isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  const key = input.groupKey.trim();
  const sep = key.indexOf("\x1f");
  if (sep < 0) return { ok: false, error: "方案标识无效。" };
  const attachmentId = Number(key.slice(0, sep));
  const rest = key.slice(sep + 1);
  const sep2 = rest.indexOf("\x1f");
  if (sep2 < 0 || !Number.isFinite(attachmentId) || attachmentId < 1) {
    return { ok: false, error: "方案标识无效。" };
  }
  const ruleLabel = rest.slice(0, sep2);
  const splitConfigJson = rest.slice(sep2 + 1);

  const db = getUserDb();
  const existing = await db
    .select({ id: buildIoStepBatches.id })
    .from(buildIoStepBatches)
    .where(
      and(
        eq(buildIoStepBatches.subjectKind, BUILD_SUBJECT_MOC),
        eq(buildIoStepBatches.subjectId, mocId),
        eq(buildIoStepBatches.attachmentId, attachmentId),
        eq(buildIoStepBatches.ruleLabel, ruleLabel),
        eq(buildIoStepBatches.splitConfigJson, splitConfigJson)
      )
    );
  if (existing.length === 0) {
    return { ok: false, error: "未找到该分包方案或已被删除。" };
  }

  try {
    db.delete(buildIoStepBatches)
      .where(
        and(
          eq(buildIoStepBatches.subjectKind, BUILD_SUBJECT_MOC),
          eq(buildIoStepBatches.subjectId, mocId),
          eq(buildIoStepBatches.attachmentId, attachmentId),
          eq(buildIoStepBatches.ruleLabel, ruleLabel),
          eq(buildIoStepBatches.splitConfigJson, splitConfigJson)
        )
      )
      .run();
    revalidateMocIoSplitPaths(mocId);
    return { ok: true, deletedBatchCount: existing.length };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}

export async function deleteIoBatchesByIds(batchIds: number[]): Promise<void> {
  const ids = batchIds.filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) return;
  const db = getUserDb();
  for (const id of ids) {
    db.delete(buildIoStepBatches).where(batchKey(id)).run();
  }
}

export async function deleteIoStepBatchesForMoc(
  subjectKind: BuildSubjectKind,
  subjectId: string,
  attachmentId?: number
): Promise<void> {
  const db = getUserDb();
  if (attachmentId != null) {
    db.delete(buildIoStepBatches)
      .where(
        and(
          eq(buildIoStepBatches.subjectKind, subjectKind),
          eq(buildIoStepBatches.subjectId, subjectId),
          eq(buildIoStepBatches.attachmentId, attachmentId)
        )
      )
      .run();
  } else {
    db.delete(buildIoStepBatches)
      .where(
        and(eq(buildIoStepBatches.subjectKind, subjectKind), eq(buildIoStepBatches.subjectId, subjectId))
      )
      .run();
  }
  revalidateMocIoSplitPaths(subjectId);
}

export type InitialIoBatchSheetFromServer = InitialBuildSheetFromServer & {
  batchId: number;
  batchLabel: string;
};
