import "server-only";

import { ensureBricktimeApiKey } from "@/lib/bricktime-config";
import { bricktimeSignedJson } from "@/lib/bricktime-api";

export type BricktimeSetPrices = {
  officialPrice: string | null;
  goodPrice: string | null;
  lowestPrice: string | null;
  recentLowPrice: string | null;
};

type BricktimeApiEnvelope<T = unknown> = {
  status?: number;
  message?: string;
  data?: T;
};

type BricktimeSetSummary = {
  rrp_cn?: number | null;
};

type BricktimePriceHistoryRow = {
  price?: number;
  update_time?: string;
};

function priceString(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return String(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s !== "-" && s !== "--" ? s : null;
}

function isAuthError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("api key") ||
    m.includes("认证失败") ||
    m.includes("缺少api key") ||
    m.includes("不正确") ||
    m.includes("过期") ||
    m.includes("invalid")
  );
}

export function bricktimeSetIdFromSetNum(setNum: string): string | null {
  const id = setNum.trim().replace(/-\d+$/, "");
  return /^\d+$/.test(id) ? id : null;
}

export function mapBricktimePriceHistory(
  history: readonly BricktimePriceHistoryRow[]
): Pick<BricktimeSetPrices, "goodPrice" | "lowestPrice" | "recentLowPrice"> {
  const prices = history
    .map((row) => row.price)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p >= 0);

  if (prices.length === 0) {
    return { goodPrice: null, lowestPrice: null, recentLowPrice: null };
  }

  const sorted = [...prices].sort((a, b) => a - b);
  const lowest = sorted[0]!;
  const recentSlice = prices.slice(-3);
  const recentLow = Math.min(...recentSlice);

  let goodPrice: string | null = null;
  if (sorted.length >= 5) {
    const lo = sorted[1]!;
    const hi = sorted[4]!;
    goodPrice = lo === hi ? String(lo) : `${lo}~${hi}`;
  } else if (sorted.length >= 2) {
    const lo = sorted[1]!;
    const hi = sorted[sorted.length - 2]!;
    goodPrice = lo === hi ? String(lo) : `${lo}~${hi}`;
  }

  return {
    lowestPrice: String(lowest),
    recentLowPrice: String(recentLow),
    goodPrice,
  };
}

export function mergeBricktimeSetPrices(input: {
  rrpCn: unknown;
  history: readonly BricktimePriceHistoryRow[];
}): BricktimeSetPrices {
  const derived = mapBricktimePriceHistory(input.history);
  return {
    officialPrice: priceString(input.rrpCn),
    goodPrice: derived.goodPrice,
    lowestPrice: derived.lowestPrice,
    recentLowPrice: derived.recentLowPrice,
  };
}

async function fetchSetPricesWithApiKey(
  bricktimeSetId: string,
  apiKey: string
): Promise<BricktimeSetPrices> {
  const setPath = `/sets/${encodeURIComponent(bricktimeSetId)}`;
  const historyPath = `/sets/${encodeURIComponent(bricktimeSetId)}/prices_history`;

  const [setRes, historyRes] = await Promise.all([
    bricktimeSignedJson<BricktimeApiEnvelope<BricktimeSetSummary>>(setPath, { apiKey }),
    bricktimeSignedJson<BricktimeApiEnvelope<BricktimePriceHistoryRow[]>>(historyPath, {
      apiKey,
    }),
  ]);

  const history = Array.isArray(historyRes.data) ? historyRes.data : [];
  const prices = mergeBricktimeSetPrices({
    rrpCn: setRes.data?.rrp_cn ?? null,
    history,
  });

  if (!Object.values(prices).some((v) => v != null)) {
    throw new Error("Bricktime 未返回可用价格字段");
  }

  return prices;
}

export async function fetchBricktimeSetPrices(
  bricktimeSetId: string
): Promise<BricktimeSetPrices> {
  let apiKey = await ensureBricktimeApiKey();
  try {
    return await fetchSetPricesWithApiKey(bricktimeSetId, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    if (!msg || !isAuthError(msg)) throw e;
    apiKey = await ensureBricktimeApiKey(true);
    return fetchSetPricesWithApiKey(bricktimeSetId, apiKey);
  }
}
