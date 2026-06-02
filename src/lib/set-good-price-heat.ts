import { parseBricktimePriceRange } from "@/lib/set-good-price-format";

export type SetGoodPriceHeatLevel = 0 | 1 | 2 | 3;

export type SetGoodPriceHeatBreakdown = {
  level: SetGoodPriceHeatLevel;
  comparePriceCny: number | null;
  belowLowest: boolean;
  belowGoodPrice: boolean;
  belowGobricks: boolean;
};

function isValidPriceCny(price: number | null | undefined): price is number {
  return typeof price === "number" && Number.isFinite(price) && price >= 0;
}

/** 取全新/二手录入价中的最低价作为对比基准 */
function bestUserPriceCny(priceNewCny: number | null, priceUsedCny: number | null): number | null {
  const prices: number[] = [];
  if (isValidPriceCny(priceNewCny)) prices.push(priceNewCny);
  if (isValidPriceCny(priceUsedCny)) prices.push(priceUsedCny);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

export function computeSetGoodPriceHeat(input: {
  priceNewCny: number | null;
  priceUsedCny: number | null;
  bricktimeLowestPrice: string | null | undefined;
  bricktimeGoodPrice: string | null | undefined;
  gobricksPriceCny: number | null | undefined;
}): SetGoodPriceHeatBreakdown {
  const comparePriceCny = bestUserPriceCny(input.priceNewCny, input.priceUsedCny);
  const empty: SetGoodPriceHeatBreakdown = {
    level: 0,
    comparePriceCny,
    belowLowest: false,
    belowGoodPrice: false,
    belowGobricks: false,
  };
  if (comparePriceCny == null) return empty;

  const lowest = parseBricktimePriceRange(input.bricktimeLowestPrice);
  const good = parseBricktimePriceRange(input.bricktimeGoodPrice);
  const gobricks = input.gobricksPriceCny;

  const belowLowest = lowest != null && comparePriceCny < lowest.min;
  const belowGoodPrice = good != null && comparePriceCny < good.min;
  const belowGobricks =
    typeof gobricks === "number" && Number.isFinite(gobricks) && gobricks >= 0
      ? comparePriceCny < gobricks
      : false;

  const level = (
    (belowLowest ? 1 : 0) + (belowGoodPrice ? 1 : 0) + (belowGobricks ? 1 : 0)
  ) as SetGoodPriceHeatLevel;

  return { level, comparePriceCny, belowLowest, belowGoodPrice, belowGobricks };
}

export function formatSetGoodPriceHeatTooltip(breakdown: SetGoodPriceHeatBreakdown): string {
  if (breakdown.level === 0) {
    return "热度 0：未低于史低、超值入手或高砖参考价";
  }
  const parts: string[] = [`热度 ${breakdown.level}`];
  if (breakdown.belowLowest) parts.push("低于史低");
  if (breakdown.belowGoodPrice) parts.push("低于超值入手");
  if (breakdown.belowGobricks) parts.push("低于高砖");
  return parts.join(" · ");
}

/** 热度筛选：全部 | 精确匹配某一档（含 0 无热度） */
export type SetGoodPriceHeatFilter =
  | { kind: "all" }
  | { kind: "exact"; level: SetGoodPriceHeatLevel };

export function parseSetGoodPriceHeatFilter(search: {
  heat?: string;
  /** 兼容旧链接 */
  heatMin?: string;
}): SetGoodPriceHeatFilter {
  const raw = search.heat ?? search.heatMin;
  if (raw === "0") return { kind: "exact", level: 0 };
  if (raw === "1" || raw === "2" || raw === "3") {
    return { kind: "exact", level: Number(raw) as 1 | 2 | 3 };
  }
  return { kind: "all" };
}

export function heatFilterToQueryValue(filter: SetGoodPriceHeatFilter): string | null {
  if (filter.kind === "all") return null;
  return String(filter.level);
}

export function isSetGoodPriceHeatFilterActive(filter: SetGoodPriceHeatFilter): boolean {
  return filter.kind === "exact";
}

export function setGoodPriceHeatFilterLabel(filter: SetGoodPriceHeatFilter): string {
  if (filter.kind === "all") return "全部";
  if (filter.level === 0) return "无热度";
  return `热度 ${filter.level}`;
}

export function itemMatchesSetGoodPriceHeatFilter(
  item: {
    priceNewCny: number | null;
    priceUsedCny: number | null;
    bricktimeLowestPrice: string | null;
    bricktimeGoodPrice: string | null;
    gobricksPriceCny: number | null;
  },
  filter: SetGoodPriceHeatFilter
): boolean {
  if (filter.kind === "all") return true;
  return computeSetGoodPriceHeat(item).level === filter.level;
}
