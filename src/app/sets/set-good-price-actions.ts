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
  fetchBricktimeSetPrices,
} from "@/lib/bricktime-set-prices";

const MAX_PRICE_CNY = 999_999;
const GOBRICKS_COMPARE_TIMEOUT_MS = 90_000;

export type SaveSetGoodPriceResult = { ok: true } | { ok: false; error: string };
export type FetchSetGoodPriceBricktimeResult =
  | {
      ok: true;
      officialPrice: string | null;
      goodPrice: string | null;
      lowestPrice: string | null;
      recentLowPrice: string | null;
    }
  | { ok: false; error: string };

function parseOptionalPriceCny(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (s.length === 0) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE_CNY) return null;
  return Math.round(n * 100) / 100;
}

async function fetchBricktimePricesForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPriceBricktimeResult> {
  const bricktimeSetId = bricktimeSetIdFromSetNum(canonicalSetNum);
  if (!bricktimeSetId) {
    return { ok: false, error: "Bricktime 仅支持数字套装编号。" };
  }

  try {
    const prices = await fetchBricktimeSetPrices(bricktimeSetId);
    return { ok: true, ...prices };
  } catch (e) {
    const msg =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "Bricktime 价格抓取失败，请重试。";
    return { ok: false, error: msg };
  }
}

async function saveBricktimePricesForSet(
  canonicalSetNum: string
): Promise<FetchSetGoodPriceBricktimeResult> {
  const res = await fetchBricktimePricesForSet(canonicalSetNum);
  if (!res.ok) return res;

  const db = getUserDb();
  await db
    .update(buildSetGoodPrices)
    .set({
      bricktimeOfficialPrice: res.officialPrice,
      bricktimeGoodPrice: res.goodPrice,
      bricktimeLowestPrice: res.lowestPrice,
      bricktimeRecentLowPrice: res.recentLowPrice,
      bricktimeFetchedAt: new Date().toISOString(),
    })
    .where(eq(buildSetGoodPrices.setNum, canonicalSetNum));
  return res;
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
    }
  | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const fetchedAtRaw = typeof o.bricktimeFetchedAt === "string" ? o.bricktimeFetchedAt.trim() : "";
  if (!fetchedAtRaw.length || Number.isNaN(Date.parse(fetchedAtRaw))) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    officialPrice: str(o.officialPrice),
    goodPrice: str(o.goodPrice),
    lowestPrice: str(o.lowestPrice),
    recentLowPrice: str(o.recentLowPrice),
    bricktimeFetchedAt: fetchedAtRaw,
  };
}

async function saveBricktimePreviewForSet(
  canonicalSetNum: string,
  preview: NonNullable<ReturnType<typeof parsePreviewBricktime>>
): Promise<void> {
  const db = getUserDb();
  await db
    .update(buildSetGoodPrices)
    .set({
      bricktimeOfficialPrice: preview.officialPrice,
      bricktimeGoodPrice: preview.goodPrice,
      bricktimeLowestPrice: preview.lowestPrice,
      bricktimeRecentLowPrice: preview.recentLowPrice,
      bricktimeFetchedAt: preview.bricktimeFetchedAt,
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
  priceUsedCny?: unknown;
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
  const priceUsedCny = parseOptionalPriceCny(input.priceUsedCny);
  if (priceNewCny == null && priceUsedCny == null) {
    return { ok: false, error: "请至少填写全新或二手价格之一。" };
  }
  if (
    (String(input.priceNewCny ?? "").trim().length > 0 && priceNewCny == null) ||
    (String(input.priceUsedCny ?? "").trim().length > 0 && priceUsedCny == null)
  ) {
    return { ok: false, error: "请输入有效的价格（0–999999 元）。" };
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
        priceUsedCny,
        channelNew: null,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: buildSetGoodPrices.setNum,
        set: { priceNewCny, priceUsedCny, channelNew: null, updatedAt },
      });

    const previewGobricks = parsePreviewGobricks(input.previewGobricks);
    if (previewGobricks) {
      await saveGobricksPreviewForSet(canonicalSetNum, previewGobricks);
    }

    const previewBricktime = parsePreviewBricktime(input.previewBricktime);
    if (previewBricktime) {
      await saveBricktimePreviewForSet(canonicalSetNum, previewBricktime);
    } else {
      await saveBricktimePricesForSet(canonicalSetNum);
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

/** 弹框内预览 Bricktime 参考价，不写库 */
export async function previewSetGoodPriceBricktimeAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceBricktimeResult> {
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
    return fetchBricktimePricesForSet(resolved.setNum);
  } catch {
    return { ok: false, error: "Bricktime 价格查询失败，请重试。" };
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

/** 抓取 Bricktime 页面并写入官方定价/行情价。 */
export async function fetchSetGoodPriceBricktimeAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceBricktimeResult> {
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

    const res = await saveBricktimePricesForSet(resolved.setNum);
    if (res.ok) {
      revalidateSetGoodPricePaths(resolved.setNum);
    }
    return res;
  } catch {
    return { ok: false, error: "Bricktime 价格更新失败，请重试。" };
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
