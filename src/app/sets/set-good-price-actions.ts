"use server";

import { eq } from "drizzle-orm";

import { setBuildWorkflowStageAction } from "@/app/build/build-workflow-actions";
import { getCatalogDb, getUserDb } from "@/db/client";
import { buildSetGoodPrices } from "@/db/schema";
import { BUILD_SUBJECT_SET, isSafeBuildSubjectId } from "@/lib/build-subject";
import { computeGobricksSetBomCompareStats } from "@/lib/gobricks-set-bom-compare";
import {
  bomToGobricksTestList,
  fetchGobricksLego2MergedPayload,
} from "@/lib/gobricks-lego2-item-list";
import { revalidateSetGoodPricePaths } from "@/lib/set-good-price-revalidate";
import { resolveCatalogSetNum } from "@/lib/resolve-catalog-set-num";
import { loadSetOfficialInventoryBomLines } from "@/lib/set-official-inventory-bom";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";
import {
  bricktimeSetIdFromSetNum,
  fetchBricktimeSetOfficialPrice,
  fetchBricktimeSetPriceHistory,
  fetchBricktimeSetSalesStatus,
  mergeBricktimeSetMeta,
  type BricktimePriceHistoryPoint,
  type BricktimeSetMeta,
} from "@/lib/bricktime-set-prices";
import {
  normalizeBricktimePriceHistoryRows,
  serializeBricktimePriceHistory,
} from "@/lib/bricktime-price-history";

const MAX_PRICE_CNY = 999_999;
const GOBRICKS_COMPARE_TIMEOUT_MS = 90_000;

export type SaveSetGoodPriceResult = { ok: true } | { ok: false; error: string };
export type FetchSetGoodPriceOfficialPriceResult =
  | {
      ok: true;
      officialPrice: string | null;
    }
  | { ok: false; error: string };

export type FetchSetGoodPricePriceHistoryResult =
  | {
      ok: true;
      goodPrice: string | null;
      lowestPrice: string | null;
      recentLowPrice: string | null;
      priceHistory: BricktimePriceHistoryPoint[];
    }
  | { ok: false; error: string };

export type FetchSetGoodPriceSalesStatusResult =
  | {
      ok: true;
      launchDate: string | null;
      retiredDate: string | null;
      salesStatus: string | null;
      salesStatusFetchedAt?: string;
      weight: string | null;
      buildingTime: string | null;
    }
  | { ok: false; error: string };

function bricktimeDbMetaPatch(meta: BricktimeSetMeta) {
  return {
    bricktimeLaunchDate: meta.launchDate,
    bricktimeRetiredDate: meta.retiredDate,
    bricktimeSalesStatus: meta.salesStatus,
    bricktimeWeight: meta.weight,
    bricktimeBuildingTime: meta.buildingTime,
  };
}

const emptyBricktimeSetMeta = (): BricktimeSetMeta => ({
  launchDate: null,
  retiredDate: null,
  salesStatus: null,
  weight: null,
  buildingTime: null,
});

async function loadExistingBricktimeSetMeta(
  setNum: string
): Promise<BricktimeSetMeta> {
  const db = getUserDb();
  const rows = await db
    .select({
      bricktimeLaunchDate: buildSetGoodPrices.bricktimeLaunchDate,
      bricktimeRetiredDate: buildSetGoodPrices.bricktimeRetiredDate,
      bricktimeSalesStatus: buildSetGoodPrices.bricktimeSalesStatus,
      bricktimeWeight: buildSetGoodPrices.bricktimeWeight,
      bricktimeBuildingTime: buildSetGoodPrices.bricktimeBuildingTime,
    })
    .from(buildSetGoodPrices)
    .where(eq(buildSetGoodPrices.setNum, setNum))
    .limit(1);

  const row = rows[0];
  if (!row) return emptyBricktimeSetMeta();

  return {
    launchDate: row.bricktimeLaunchDate,
    retiredDate: row.bricktimeRetiredDate,
    salesStatus: row.bricktimeSalesStatus,
    weight: row.bricktimeWeight,
    buildingTime: row.bricktimeBuildingTime,
  };
}

function bricktimeDbHistoryPatch(priceHistory: readonly BricktimePriceHistoryPoint[]) {
  return {
    bricktimePriceHistory: serializeBricktimePriceHistory(priceHistory),
  };
}

function parseOptionalPriceCny(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (s.length === 0) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE_CNY) return null;
  return Math.round(n * 100) / 100;
}

async function fetchBricktimeOfficialPriceForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPriceOfficialPriceResult> {
  const bricktimeSetId = bricktimeSetIdFromSetNum(canonicalSetNum);
  if (!bricktimeSetId) {
    return { ok: false, error: "Bricktime 仅支持数字套装编号。" };
  }

  try {
    const data = await fetchBricktimeSetOfficialPrice(bricktimeSetId);
    return {
      ok: true,
      officialPrice: data.officialPrice,
    };
  } catch (e) {
    const msg =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "Bricktime 官方价抓取失败，请重试。";
    return { ok: false, error: msg };
  }
}

async function fetchBricktimePriceHistoryForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPricePriceHistoryResult> {
  const bricktimeSetId = bricktimeSetIdFromSetNum(canonicalSetNum);
  if (!bricktimeSetId) {
    return { ok: false, error: "Bricktime 仅支持数字套装编号。" };
  }

  try {
    const data = await fetchBricktimeSetPriceHistory(bricktimeSetId);
    return {
      ok: true,
      goodPrice: data.goodPrice,
      lowestPrice: data.lowestPrice,
      recentLowPrice: data.recentLowPrice,
      priceHistory: data.priceHistory,
    };
  } catch (e) {
    const msg =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "Bricktime 价格历史抓取失败，请重试。";
    return { ok: false, error: msg };
  }
}

async function saveBricktimePriceHistoryForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPricePriceHistoryResult> {
  const res = await fetchBricktimePriceHistoryForSet(canonicalSetNum);
  if (!res.ok) return res;

  const db = getUserDb();
  await db
    .update(buildSetGoodPrices)
    .set({
      bricktimeGoodPrice: res.goodPrice,
      bricktimeLowestPrice: res.lowestPrice,
      bricktimeRecentLowPrice: res.recentLowPrice,
      bricktimeFetchedAt: new Date().toISOString(),
      ...bricktimeDbHistoryPatch(res.priceHistory),
    })
    .where(eq(buildSetGoodPrices.setNum, canonicalSetNum));

  return res;
}

async function fetchBricktimeSalesStatusForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPriceSalesStatusResult> {
  const bricktimeSetId = bricktimeSetIdFromSetNum(canonicalSetNum);
  if (!bricktimeSetId) {
    return { ok: false, error: "Bricktime 仅支持数字套装编号。" };
  }

  try {
    const meta = await fetchBricktimeSetSalesStatus(bricktimeSetId);
    return { ok: true, ...meta };
  } catch (e) {
    const msg =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "Bricktime 销售状态抓取失败，请重试。";
    return { ok: false, error: msg };
  }
}

async function saveBricktimeSalesStatusForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPriceSalesStatusResult> {
  const res = await fetchBricktimeSalesStatusForSet(canonicalSetNum);
  if (!res.ok) return res;

  const existingMeta = await loadExistingBricktimeSetMeta(canonicalSetNum);
  const mergedMeta = mergeBricktimeSetMeta(existingMeta, {
    launchDate: res.launchDate,
    retiredDate: res.retiredDate,
    salesStatus: res.salesStatus,
    weight: res.weight,
    buildingTime: res.buildingTime,
  });
  const salesStatusFetchedAt = new Date().toISOString();

  const db = getUserDb();
  await db
    .update(buildSetGoodPrices)
    .set({
      ...bricktimeDbMetaPatch(mergedMeta),
      bricktimeSalesStatusFetchedAt: salesStatusFetchedAt,
    })
    .where(eq(buildSetGoodPrices.setNum, canonicalSetNum));

  return {
    ok: true,
    launchDate: mergedMeta.launchDate,
    retiredDate: mergedMeta.retiredDate,
    salesStatus: mergedMeta.salesStatus,
    salesStatusFetchedAt,
    weight: mergedMeta.weight,
    buildingTime: mergedMeta.buildingTime,
  };
}

function parseGobricksMatchPercent(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

function parsePreviewGobricks(raw: unknown):
  | { gobricksPriceCny: number; gobricksMatchPercent: number | null; gobricksComparedAt: string }
  | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const gobricksPriceCny = parseOptionalPriceCny(o.gobricksPriceCny);
  if (gobricksPriceCny == null) return null;
  const gobricksMatchPercent = parseGobricksMatchPercent(o.gobricksMatchPercent);
  const comparedAtRaw = typeof o.gobricksComparedAt === "string" ? o.gobricksComparedAt.trim() : "";
  const gobricksComparedAt =
    comparedAtRaw.length > 0 && !Number.isNaN(Date.parse(comparedAtRaw))
      ? comparedAtRaw
      : new Date().toISOString();
  return { gobricksPriceCny, gobricksMatchPercent, gobricksComparedAt };
}

function parsePreviewBricktime(raw: unknown):
  | {
      officialPrice: string | null;
      goodPrice: string | null;
      lowestPrice: string | null;
      recentLowPrice: string | null;
      bricktimeFetchedAt: string;
      launchDate: string | null;
      retiredDate: string | null;
      salesStatus: string | null;
      salesStatusFetchedAt?: string | null;
      weight: string | null;
      buildingTime: string | null;
      priceHistory: BricktimePriceHistoryPoint[];
    }
  | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fetchedAtRaw = typeof o.bricktimeFetchedAt === "string" ? o.bricktimeFetchedAt.trim() : "";
  if (!fetchedAtRaw.length || Number.isNaN(Date.parse(fetchedAtRaw))) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const salesStatusFetchedAtRaw =
    typeof o.salesStatusFetchedAt === "string" ? o.salesStatusFetchedAt.trim() : "";
  const salesStatusFetchedAt =
    salesStatusFetchedAtRaw.length > 0 && !Number.isNaN(Date.parse(salesStatusFetchedAtRaw))
      ? salesStatusFetchedAtRaw
      : null;
  const priceHistory = Array.isArray(o.priceHistory)
    ? normalizeBricktimePriceHistoryRows(o.priceHistory as Record<string, unknown>[])
    : [];
  return {
    officialPrice: str(o.officialPrice),
    goodPrice: str(o.goodPrice),
    lowestPrice: str(o.lowestPrice),
    recentLowPrice: str(o.recentLowPrice),
    bricktimeFetchedAt: fetchedAtRaw,
    launchDate: str(o.launchDate),
    retiredDate: str(o.retiredDate),
    salesStatus: str(o.salesStatus),
    salesStatusFetchedAt,
    weight: str(o.weight),
    buildingTime: str(o.buildingTime),
    priceHistory,
  };
}

async function saveBricktimePreviewForSet(
  canonicalSetNum: string,
  preview: NonNullable<ReturnType<typeof parsePreviewBricktime>>
): Promise<void> {
  const db = getUserDb();
  const existingRows = await db
    .select({
      bricktimeOfficialPrice: buildSetGoodPrices.bricktimeOfficialPrice,
      bricktimeGoodPrice: buildSetGoodPrices.bricktimeGoodPrice,
      bricktimeLowestPrice: buildSetGoodPrices.bricktimeLowestPrice,
      bricktimeRecentLowPrice: buildSetGoodPrices.bricktimeRecentLowPrice,
      bricktimeFetchedAt: buildSetGoodPrices.bricktimeFetchedAt,
      bricktimeSalesStatusFetchedAt: buildSetGoodPrices.bricktimeSalesStatusFetchedAt,
    })
    .from(buildSetGoodPrices)
    .where(eq(buildSetGoodPrices.setNum, canonicalSetNum))
    .limit(1);
  const existing = existingRows[0];

  const existingMeta = await loadExistingBricktimeSetMeta(canonicalSetNum);
  const mergedMeta = mergeBricktimeSetMeta(existingMeta, {
    launchDate: preview.launchDate,
    retiredDate: preview.retiredDate,
    salesStatus: preview.salesStatus,
    weight: preview.weight,
    buildingTime: preview.buildingTime,
  });

  await db
    .update(buildSetGoodPrices)
    .set({
      bricktimeOfficialPrice: preview.officialPrice ?? existing?.bricktimeOfficialPrice ?? null,
      bricktimeGoodPrice: preview.goodPrice ?? existing?.bricktimeGoodPrice ?? null,
      bricktimeLowestPrice: preview.lowestPrice ?? existing?.bricktimeLowestPrice ?? null,
      bricktimeRecentLowPrice:
        preview.recentLowPrice ?? existing?.bricktimeRecentLowPrice ?? null,
      bricktimeFetchedAt: preview.officialPrice != null ||
        preview.goodPrice != null ||
        preview.lowestPrice != null ||
        preview.recentLowPrice != null
        ? preview.bricktimeFetchedAt
        : existing?.bricktimeFetchedAt ?? preview.bricktimeFetchedAt,
      ...(preview.salesStatus != null
        ? {
            bricktimeSalesStatusFetchedAt:
              preview.salesStatusFetchedAt ??
              existing?.bricktimeSalesStatusFetchedAt ??
              new Date().toISOString(),
          }
        : {}),
      ...bricktimeDbMetaPatch(mergedMeta),
      ...(preview.priceHistory.length > 0
        ? bricktimeDbHistoryPatch(preview.priceHistory)
        : {}),
    })
    .where(eq(buildSetGoodPrices.setNum, canonicalSetNum));
}

async function saveGobricksPreviewForSet(
  canonicalSetNum: string,
  preview: NonNullable<ReturnType<typeof parsePreviewGobricks>>
): Promise<void> {
  const db = getUserDb();
  await db
    .update(buildSetGoodPrices)
    .set({
      gobricksPriceCny: preview.gobricksPriceCny,
      gobricksMatchPercent: preview.gobricksMatchPercent,
      gobricksComparedAt: preview.gobricksComparedAt,
    })
    .where(eq(buildSetGoodPrices.setNum, canonicalSetNum));
}

export async function saveSetGoodPriceAction(input: {
  setNum: string;
  priceNewCny?: unknown;
  /** 弹框内已预览的高砖比价，保存时一并写入 */
  previewGobricks?: unknown;
  /** 弹框内已预览的 Bricktime 参考价，保存时一并写入（避免重复请求） */
  previewBricktime?: unknown;
}): Promise<SaveSetGoodPriceResult> {
  const setNum = input.setNum.trim();
  if (!setNum || setNum.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "套装编号无效。" };
  }
  if (!isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号含有非法字符。" };
  }

  const priceNewCny = parseOptionalPriceCny(input.priceNewCny);
  if (String(input.priceNewCny ?? "").trim().length > 0 && priceNewCny == null) {
    return { ok: false, error: "请输入有效的价格（0–999999 元）。" };
  }
  if (priceNewCny == null) {
    return { ok: false, error: "请填写当前价格。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    const canonicalSetNum = resolved.setNum;

    const updatedAt = new Date().toISOString();
    const db = getUserDb();

    await db
      .insert(buildSetGoodPrices)
      .values({
        setNum: canonicalSetNum,
        priceNewCny,
        priceUsedCny: null,
        channelNew: null,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: buildSetGoodPrices.setNum,
        set: { priceNewCny, priceUsedCny: null, channelNew: null, updatedAt },
      });

    const previewGobricks = parsePreviewGobricks(input.previewGobricks);
    if (previewGobricks) {
      await saveGobricksPreviewForSet(canonicalSetNum, previewGobricks);
    }

    const previewBricktime = parsePreviewBricktime(input.previewBricktime);
    if (previewBricktime) {
      await saveBricktimePreviewForSet(canonicalSetNum, previewBricktime);
    }

    revalidateSetGoodPricePaths(canonicalSetNum);
    return { ok: true };
  } catch {
    return { ok: false, error: "保存失败，请重试。" };
  }
}

/** 标记套装为拥有，并移出好价榜 */
export async function markSetOwnedFromGoodPriceAction(input: {
  setNum: string;
}): Promise<SaveSetGoodPriceResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  const workflowRes = await setBuildWorkflowStageAction({
    subjectKind: BUILD_SUBJECT_SET,
    subjectId: setNum,
    stage: "complete",
  });
  if (!workflowRes.ok) return workflowRes;

  return clearSetGoodPriceAction({ setNum });
}

/** 标记套装为心动，保留在好价榜 */
export async function markSetWantedFromGoodPriceAction(input: {
  setNum: string;
}): Promise<SaveSetGoodPriceResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  const workflowRes = await setBuildWorkflowStageAction({
    subjectKind: BUILD_SUBJECT_SET,
    subjectId: setNum,
    stage: "replicate",
  });
  if (!workflowRes.ok) return workflowRes;

  revalidateSetGoodPricePaths(setNum);
  return { ok: true };
}

/** 取消套装心动标记，恢复为收录阶段 */
export async function unmarkSetWantedFromGoodPriceAction(input: {
  setNum: string;
}): Promise<SaveSetGoodPriceResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  const workflowRes = await setBuildWorkflowStageAction({
    subjectKind: BUILD_SUBJECT_SET,
    subjectId: setNum,
    stage: "collected",
  });
  if (!workflowRes.ok) return workflowRes;

  revalidateSetGoodPricePaths(setNum);
  return { ok: true };
}

export type FetchSetGoodPriceGobricksCompareResult =
  | {
      ok: true;
      gobricksPriceCny: number;
      gobricksMatchPercent: number | null;
      bomPieceQty: number;
      partMissPieceQty: number;
    }
  | { ok: false; error: string };

/** 用官方 BOM 请求高砖并写入比价结果（好价榜「高砖比价」） */
export async function fetchSetGoodPriceGobricksCompareAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceGobricksCompareResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    const canonicalSetNum = resolved.setNum;

    const compareRes = await fetchGobricksCompareForSet(canonicalSetNum);
    if (!compareRes.ok) return compareRes;

    const gobricksComparedAt = new Date().toISOString();
    const db = getUserDb();
    await db
      .update(buildSetGoodPrices)
      .set({
        gobricksPriceCny: compareRes.gobricksPriceCny,
        gobricksMatchPercent: compareRes.gobricksMatchPercent,
        gobricksComparedAt,
      })
      .where(eq(buildSetGoodPrices.setNum, canonicalSetNum));

    revalidateSetGoodPricePaths(canonicalSetNum);
    return compareRes;
  } catch {
    return { ok: false, error: "高砖比价失败，请重试。" };
  }
}

async function fetchGobricksCompareForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPriceGobricksCompareResult> {
  const bom = await loadSetOfficialInventoryBomLines(canonicalSetNum);
  if (bom.length === 0) {
    return { ok: false, error: "本地无该套装官方库存，无法对照高砖。" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOBRICKS_COMPARE_TIMEOUT_MS);
  let merged: unknown;
  try {
    merged = await fetchGobricksLego2MergedPayload(bomToGobricksTestList(bom), {
      signal: controller.signal,
    });
  } catch (e) {
    const msg = controller.signal.aborted
      ? "请求高砖超时，请稍后重试。"
      : e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "请求高砖失败，请稍后重试。";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }

  const stats = computeGobricksSetBomCompareStats(bom, merged);
  return {
    ok: true,
    gobricksPriceCny: stats.totalPriceCny,
    gobricksMatchPercent: stats.matchPercent,
    bomPieceQty: stats.bomPieceQty,
    partMissPieceQty: stats.partMissPieceQty,
  };
}

/** 弹框内预览 Bricktime 官方价，不写库；只调用 /sets/{id}。 */
export async function previewSetGoodPriceOfficialPriceAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceOfficialPriceResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    return fetchBricktimeOfficialPriceForSet(resolved.setNum);
  } catch {
    return { ok: false, error: "Bricktime 官方价查询失败，请重试。" };
  }
}

/** 弹框内预览 Bricktime 价格历史，不写库；只调用 /sets/{id}/prices_history。 */
export async function previewSetGoodPricePriceHistoryAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPricePriceHistoryResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    return fetchBricktimePriceHistoryForSet(resolved.setNum);
  } catch {
    return { ok: false, error: "Bricktime 价格历史查询失败，请重试。" };
  }
}

/** 弹框内预览 Bricktime 销售状态，不写库；只调用 /sets/{id}。 */
export async function previewSetGoodPriceSalesStatusAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceSalesStatusResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    return fetchBricktimeSalesStatusForSet(resolved.setNum);
  } catch {
    return { ok: false, error: "Bricktime 销售状态查询失败，请重试。" };
  }
}

/** 弹框内预览高砖比价，不写库 */
export async function previewSetGoodPriceGobricksCompareAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceGobricksCompareResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    return fetchGobricksCompareForSet(resolved.setNum);
  } catch {
    return { ok: false, error: "高砖比价失败，请重试。" };
  }
}

/** 抓取 Bricktime 价格历史；只调用 /sets/{id}/prices_history。 */
export async function fetchSetGoodPricePriceHistoryAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPricePriceHistoryResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    const res = await saveBricktimePriceHistoryForSet(resolved.setNum);
    if (res.ok) {
      revalidateSetGoodPricePaths(resolved.setNum);
    }
    return res;
  } catch {
    return { ok: false, error: "Bricktime 价格历史更新失败，请重试。" };
  }
}

/** 抓取 Bricktime 销售状态与套装元数据；只调用 /sets/{id}。 */
export async function fetchSetGoodPriceSalesStatusAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceSalesStatusResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }

    const res = await saveBricktimeSalesStatusForSet(resolved.setNum);
    if (res.ok) {
      revalidateSetGoodPricePaths(resolved.setNum);
    }
    return res;
  } catch {
    return { ok: false, error: "Bricktime 销售状态更新失败，请重试。" };
  }
}

export async function clearSetGoodPriceAction(input: {
  setNum: string;
}): Promise<SaveSetGoodPriceResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const db = getUserDb();
    await db.delete(buildSetGoodPrices).where(eq(buildSetGoodPrices.setNum, setNum));
    revalidateSetGoodPricePaths(setNum);
    return { ok: true };
  } catch {
    return { ok: false, error: "清除失败，请重试。" };
  }
}
