import "server-only";

import { ensureBricktimeApiKey } from "@/lib/bricktime-config";
import { bricktimeSignedJson } from "@/lib/bricktime-api";
import {
  normalizeBricktimePriceHistoryRows,
  type BricktimePriceHistoryPoint,
} from "@/lib/bricktime-price-history";

export type { BricktimePriceHistoryPoint } from "@/lib/bricktime-price-history";

export type BricktimeSetOfficialPrice = {
  officialPrice: string | null;
};

export type BricktimeSetPriceHistoryPrices = {
  goodPrice: string | null;
  lowestPrice: string | null;
  recentLowPrice: string | null;
  priceHistory: BricktimePriceHistoryPoint[];
};

/** Bricktime 套装元数据（优先从 /sets/{id} 读取，避免额外 theme 分页请求） */
export type BricktimeSetMeta = {
  launchDate: string | null;
  retiredDate: string | null;
  salesStatus: string | null;
  weight: string | null;
  buildingTime: string | null;
};

type BricktimeApiEnvelope<T = unknown> = {
  status?: number;
  message?: string;
  data?: T;
};

type BricktimeSetSummary = {
  rrp_cn?: number | null;
  theme?: string | null;
  retired_state_word?: string | null;
  launch_date?: string | null;
  retired_date?: string | null;
  weight?: string | number | null;
  building_time?: string | number | null;
};

type BricktimeThemeSetListItem = {
  numbers?: string | number;
  retired_state_word?: string | null;
};

type BricktimeThemeSetsPage = {
  pages?: { total_pages?: number; total_page?: number };
  set_list?: BricktimeThemeSetListItem[];
};

type BricktimePriceHistoryRow = {
  price?: number;
  update_time?: string;
};

const THEME_SETS_PAGE_SIZE = 50;
const THEME_SETS_MAX_PAGES = 20;

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

/** 合并 Bricktime 元数据：新抓取为空时保留库中已有值，避免刷新官方价清空销售状态等字段 */
export function mergeBricktimeSetMeta(
  existing: BricktimeSetMeta,
  incoming: BricktimeSetMeta
): BricktimeSetMeta {
  return {
    launchDate: incoming.launchDate ?? existing.launchDate,
    retiredDate: incoming.retiredDate ?? existing.retiredDate,
    salesStatus: incoming.salesStatus ?? existing.salesStatus,
    weight: incoming.weight ?? existing.weight,
    buildingTime: incoming.buildingTime ?? existing.buildingTime,
  };
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
): Omit<BricktimeSetPriceHistoryPrices, "priceHistory"> {
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

async function fetchSetSummaryWithApiKey(
  bricktimeSetId: string,
  apiKey: string
): Promise<BricktimeSetSummary | null | undefined> {
  const setPath = `/sets/${encodeURIComponent(bricktimeSetId)}`;
  const setRes = await bricktimeSignedJson<BricktimeApiEnvelope<BricktimeSetSummary>>(setPath, {
    apiKey,
  });
  return setRes.data;
}

async function lookupSalesStatusInTheme(
  theme: string,
  bricktimeSetId: string,
  apiKey: string
): Promise<string | null> {
  const themeSlug = theme.trim();
  if (!themeSlug) return null;

  for (let page = 1; page <= THEME_SETS_MAX_PAGES; page += 1) {
    let res: BricktimeApiEnvelope<BricktimeThemeSetsPage>;
    try {
      res = await bricktimeSignedJson<BricktimeApiEnvelope<BricktimeThemeSetsPage>>(
        `/themes/${encodeURIComponent(themeSlug)}/sets?page=${page}&page_size=${THEME_SETS_PAGE_SIZE}`,
        { apiKey }
      );
    } catch {
      return null;
    }

    const list = Array.isArray(res.data?.set_list) ? res.data.set_list : [];
    for (const item of list) {
      if (String(item.numbers ?? "").trim() === bricktimeSetId) {
        return textOrNull(item.retired_state_word);
      }
    }

    const totalPages =
      res.data?.pages?.total_pages ?? res.data?.pages?.total_page ?? page;
    if (page >= totalPages || list.length === 0) break;
  }

  return null;
}

async function resolveSalesStatus(
  setData: BricktimeSetSummary | null | undefined,
  bricktimeSetId: string,
  apiKey: string
): Promise<string | null> {
  const fromDetail = textOrNull(setData?.retired_state_word);
  if (fromDetail != null) return fromDetail;

  const theme = textOrNull(setData?.theme);
  if (theme == null) return null;
  return lookupSalesStatusInTheme(theme, bricktimeSetId, apiKey);
}

async function fetchSetSalesStatusWithApiKey(
  bricktimeSetId: string,
  apiKey: string
): Promise<BricktimeSetMeta> {
  const setData = await fetchSetSummaryWithApiKey(bricktimeSetId, apiKey);
  const salesStatus = await resolveSalesStatus(setData, bricktimeSetId, apiKey);

  return mapBricktimeSetMetaFromSetDetail({
    retiredStateWord: salesStatus,
    launchDate: setData?.launch_date,
    retiredDate: setData?.retired_date,
    weight: setData?.weight,
    buildingTime: setData?.building_time,
  });
}

async function fetchPriceHistoryWithApiKey(
  bricktimeSetId: string,
  apiKey: string
): Promise<BricktimeSetPriceHistoryPrices> {
  const historyPath = `/sets/${encodeURIComponent(bricktimeSetId)}/prices_history`;
  const historyRes = await bricktimeSignedJson<BricktimeApiEnvelope<BricktimePriceHistoryRow[]>>(
    historyPath,
    { apiKey }
  );
  const history = normalizeBricktimePriceHistoryRows(
    Array.isArray(historyRes.data) ? historyRes.data : []
  );
  const prices = mapBricktimePriceHistory(history);

  if (!Object.values(prices).some((v) => v != null)) {
    throw new Error("Bricktime 未返回可用价格历史");
  }

  return { ...prices, priceHistory: history };
}

export async function fetchBricktimeSetOfficialPrice(
  bricktimeSetId: string
): Promise<BricktimeSetOfficialPrice> {
  let apiKey = await ensureBricktimeApiKey();
  try {
    const setData = await fetchSetSummaryWithApiKey(bricktimeSetId, apiKey);
    return { officialPrice: priceString(setData?.rrp_cn ?? null) };
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    if (!msg || !isAuthError(msg)) throw e;
    apiKey = await ensureBricktimeApiKey(true);
    const setData = await fetchSetSummaryWithApiKey(bricktimeSetId, apiKey);
    return { officialPrice: priceString(setData?.rrp_cn ?? null) };
  }
}

export async function fetchBricktimeSetPriceHistory(
  bricktimeSetId: string
): Promise<BricktimeSetPriceHistoryPrices> {
  let apiKey = await ensureBricktimeApiKey();
  try {
    return await fetchPriceHistoryWithApiKey(bricktimeSetId, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    if (!msg || !isAuthError(msg)) throw e;
    apiKey = await ensureBricktimeApiKey(true);
    return await fetchPriceHistoryWithApiKey(bricktimeSetId, apiKey);
  }
}

/** 仅抓取销售状态与套装元数据（免费套餐走 theme 列表补全 retired_state_word） */
export async function fetchBricktimeSetSalesStatus(
  bricktimeSetId: string
): Promise<BricktimeSetMeta> {
  let apiKey = await ensureBricktimeApiKey();
  try {
    return await fetchSetSalesStatusWithApiKey(bricktimeSetId, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message.trim() : "";
    if (!msg || !isAuthError(msg)) throw e;
    apiKey = await ensureBricktimeApiKey(true);
    return await fetchSetSalesStatusWithApiKey(bricktimeSetId, apiKey);
  }
}
