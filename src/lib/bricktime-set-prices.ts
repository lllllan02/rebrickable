import "server-only";

import { ensureBricktimeApiKey } from "@/lib/bricktime-config";
import { bricktimeSignedJson } from "@/lib/bricktime-api";
import {
  normalizeBricktimePriceHistoryRows,
  type BricktimePriceHistoryPoint,
} from "@/lib/bricktime-price-history";

export type { BricktimePriceHistoryPoint } from "@/lib/bricktime-price-history";

export type BricktimeSetPrices = {
  officialPrice: string | null;
  goodPrice: string | null;
  lowestPrice: string | null;
  recentLowPrice: string | null;
};

/** Bricktime 套装元数据（优先从 /sets/{id} 读取，避免额外 theme 分页请求） */
export type BricktimeSetMeta = {
  launchDate: string | null;
  retiredDate: string | null;
  salesStatus: string | null;
  weight: string | null;
  buildingTime: string | null;
};

export type BricktimeSetData = BricktimeSetPrices & BricktimeSetMeta & {
  priceHistory: BricktimePriceHistoryPoint[];
};

type BricktimeApiEnvelope<T = unknown> = {
  status?: number;
  message?: string;
  data?: T;
};

type BricktimeSetSummary = {
  rrp_cn?: number | null;
  retired_state_word?: string | null;
  launch_date?: string | null;
  retired_date?: string | null;
  weight?: string | number | null;
  building_time?: string | number | null;
};

type BricktimePriceHistoryRow = {
  price?: number;
  update_time?: string;
};

function textOrNull(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 && s !== "-" && s !== "--" ? s : null;
}

export function mapBricktimeSetMetaFromSetDetail(input: {
  retiredStateWord?: unknown;
  launchDate?: unknown;
  retiredDate?: unknown;
  weight?: unknown;
  buildingTime?: unknown;
}): BricktimeSetMeta {
  return {
    launchDate: textOrNull(input.launchDate),
    retiredDate: textOrNull(input.retiredDate),
    salesStatus: textOrNull(input.retiredStateWord),
    weight: textOrNull(input.weight),
    buildingTime: textOrNull(input.buildingTime),
  };
}

export function hasAnyBricktimeSetMeta(meta: BricktimeSetMeta): boolean {
  return (
    meta.launchDate != null ||
    meta.retiredDate != null ||
    meta.salesStatus != null ||
    meta.weight != null ||
    meta.buildingTime != null
  );
}

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

async function fetchSetDataWithApiKey(
  bricktimeSetId: string,
  apiKey: string
): Promise<BricktimeSetData> {
  const setPath = `/sets/${encodeURIComponent(bricktimeSetId)}`;
  const historyPath = `/sets/${encodeURIComponent(bricktimeSetId)}/prices_history`;

  const [setRes, historyRes] = await Promise.all([
    bricktimeSignedJson<BricktimeApiEnvelope<BricktimeSetSummary>>(setPath, { apiKey }),
    bricktimeSignedJson<BricktimeApiEnvelope<BricktimePriceHistoryRow[]>>(historyPath, {
      apiKey,
    }),
  ]);

  const history = normalizeBricktimePriceHistoryRows(
    Array.isArray(historyRes.data) ? historyRes.data : []
  );
  const prices = mergeBricktimeSetPrices({
    rrpCn: setRes.data?.rrp_cn ?? null,
    history,
  });

  if (!Object.values(prices).some((v) => v != null)) {
    throw new Error("Bricktime 未返回可用价格字段");
  }

  const setData = setRes.data;
  const meta = mapBricktimeSetMetaFromSetDetail({
    retiredStateWord: setData?.retired_state_word,
    launchDate: setData?.launch_date,
    retiredDate: setData?.retired_date,
    weight: setData?.weight,
    buildingTime: setData?.building_time,
  });

  return { ...prices, ...meta, priceHistory: history };
}

export async function fetchBricktimeSetPrices(
  bricktimeSetId: string
): Promise<BricktimeSetPrices> {
  const data = await fetchBricktimeSetData(bricktimeSetId);
  return {
    officialPrice: data.officialPrice,
    goodPrice: data.goodPrice,
    lowestPrice: data.lowestPrice,
    recentLowPrice: data.recentLowPrice,
  };
}

export async function fetchBricktimeSetData(
  bricktimeSetId: string
): Promise<BricktimeSetData> {
  let apiKey = await ensureBricktimeApiKey();
  try {
    return await fetchSetDataWithApiKey(bricktimeSetId, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    if (!msg || !isAuthError(msg)) throw e;
    apiKey = await ensureBricktimeApiKey(true);
    return await fetchSetDataWithApiKey(bricktimeSetId, apiKey);
  }
}
