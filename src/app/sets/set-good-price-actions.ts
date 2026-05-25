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

const MAX_PRICE_CNY = 999_999;
const GOBRICKS_COMPARE_TIMEOUT_MS = 90_000;

export type SaveSetGoodPriceResult = { ok: true } | { ok: false; error: string };

function parseOptionalPriceCny(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (s.length === 0) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE_CNY) return null;
  return Math.round(n * 100) / 100;
}

export async function saveSetGoodPriceAction(input: {
  setNum: string;
  priceNewCny?: unknown;
  priceUsedCny?: unknown;
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
    const gobricksComparedAt = new Date().toISOString();
    const db = getUserDb();
    await db
      .update(buildSetGoodPrices)
      .set({
        gobricksPriceCny: stats.totalPriceCny,
        gobricksMatchPercent: stats.matchPercent,
        gobricksComparedAt,
      })
      .where(eq(buildSetGoodPrices.setNum, canonicalSetNum));

    revalidateSetGoodPricePaths(canonicalSetNum);
    return {
      ok: true,
      gobricksPriceCny: stats.totalPriceCny,
      gobricksMatchPercent: stats.matchPercent,
      bomPieceQty: stats.bomPieceQty,
      partMissPieceQty: stats.partMissPieceQty,
    };
  } catch {
    return { ok: false, error: "高砖比价失败，请重试。" };
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
