"use server";

import { eq } from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import { buildSetGoodPrices } from "@/db/schema";
import { BUILD_SUBJECT_SET, isSafeBuildSubjectId } from "@/lib/build-subject";
import { parseSetGoodPriceChannelNew } from "@/lib/set-good-price-channel";
import { revalidateSetGoodPricePaths } from "@/lib/set-good-price-revalidate";
import { resolveCatalogSetNum } from "@/lib/resolve-catalog-set-num";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

const MAX_PRICE_CNY = 999_999;

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
  channelNew?: unknown;
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

  const channelNew =
    priceNewCny != null ? parseSetGoodPriceChannelNew(input.channelNew) : null;

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
        channelNew,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: buildSetGoodPrices.setNum,
        set: { priceNewCny, priceUsedCny, channelNew, updatedAt },
      });

    revalidateSetGoodPricePaths(canonicalSetNum);
    return { ok: true };
  } catch {
    return { ok: false, error: "保存失败，请重试。" };
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
