import "server-only";

import { ensureBricktimeApiKey } from "@/lib/bricktime-config";
import { bricktimeSignedJson } from "@/lib/bricktime-api";

export type BricktimeSetPrices = {
  officialPrice: string | null;
  goodPrice: string | null;
  lowestPrice: string | null;
  recentLowPrice: string | null;
};

/** Bricktime 套装元数据（免费套餐可获取销售状态；上下市/重量/拼搭需高级套餐） */
export type BricktimeSetMeta = {
  launchDate: string | null;
  retiredDate: string | null;
  salesStatus: string | null;
  weight: string | null;
  buildingTime: string | null;
};

export type BricktimeSetData = BricktimeSetPrices & BricktimeSetMeta;

type BricktimeApiEnvelope<T = unknown> = {
  status?: number;
  message?: string;
  data?: T;
};

type BricktimeSetSummary = {
  rrp_cn?: number | null;
  theme?: string | null;
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

export function mapBricktimeSetMetaFromFreeTier(input: {
  retiredStateWord?: unknown;
}): BricktimeSetMeta {
  return {
    launchDate: null,
    retiredDate: null,
    salesStatus: textOrNull(input.retiredStateWord),
    weight: null,
    buildingTime: null,
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

  const history = Array.isArray(historyRes.data) ? historyRes.data : [];
  const prices = mergeBricktimeSetPrices({
    rrpCn: setRes.data?.rrp_cn ?? null,
    history,
  });

  if (!Object.values(prices).some((v) => v != null)) {
    throw new Error("Bricktime 未返回可用价格字段");
  }

  const theme = textOrNull(setRes.data?.theme);
  const retiredStateWord =
    theme != null
      ? await lookupSalesStatusInTheme(theme, bricktimeSetId, apiKey)
      : null;
  const meta = mapBricktimeSetMetaFromFreeTier({ retiredStateWord });

  return { ...prices, ...meta };
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
