import { discountFoldVsOfficialPrice } from "@/lib/set-good-price-format";
import type { BuildWorkflowStage } from "@/lib/build-workflow-stage";

export type SetGoodPriceSortMetric = "price" | "per_piece" | "discount";
export type SetGoodPriceSortDir = "asc" | "desc";

export const SET_GOOD_PRICE_DEFAULT_METRIC: SetGoodPriceSortMetric = "price";
export const SET_GOOD_PRICE_DEFAULT_DIR: SetGoodPriceSortDir = "asc";

export type SetGoodPriceListSortState = {
  metric: SetGoodPriceSortMetric;
  dir: SetGoodPriceSortDir;
  /** URL 未带完整排序参数时使用默认（总价 · 低到高） */
  neutral: boolean;
};

export const SET_GOOD_PRICE_NEUTRAL_SORT_STATE: SetGoodPriceListSortState = {
  metric: SET_GOOD_PRICE_DEFAULT_METRIC,
  dir: SET_GOOD_PRICE_DEFAULT_DIR,
  neutral: true,
};

const NULL_ASC = 9.0e307;
const NULL_DESC = -1.0;

export type SetGoodPriceListItem = {
  setNum: string;
  priceNewCny: number | null;
  updatedAt: string;
  catalogName: string | null;
  year: number | null;
  numParts: number | null;
  /** 官方 BOM 高砖比价总价（元） */
  gobricksPriceCny: number | null;
  /** 零件匹配占比（0–100） */
  gobricksMatchPercent: number | null;
  gobricksComparedAt: string | null;
  bricktimeOfficialPrice: string | null;
  bricktimeGoodPrice: string | null;
  bricktimeLowestPrice: string | null;
  bricktimeRecentLowPrice: string | null;
  bricktimeFetchedAt: string | null;
  bricktimeLaunchDate: string | null;
  bricktimeRetiredDate: string | null;
  bricktimeSalesStatus: string | null;
  bricktimeWeight: string | null;
  bricktimeBuildingTime: string | null;
  bricktimePriceHistory: string | null;
  workflowStage: BuildWorkflowStage | null;
};

function parseMetric(raw: string | undefined): SetGoodPriceSortMetric | null {
  if (raw === "price" || raw === "per_piece" || raw === "discount") return raw;
  return null;
}

/** 兼容旧版 ?sort=price|per_piece|per_stud_unit|discount */
function metricFromLegacySort(sortRaw: string | undefined): SetGoodPriceSortMetric | null {
  if (sortRaw === "price") return "price";
  if (sortRaw === "per_piece") return "per_piece";
  if (sortRaw === "discount") return "discount";
  if (sortRaw === "per_stud_unit") return "price";
  return null;
}

function parseDir(raw: string | undefined): SetGoodPriceSortDir | null {
  if (raw === "asc" || raw === "desc") return raw;
  return null;
}

export function parseSetGoodPriceListSort(
  search: {
    metric?: string;
    dir?: string;
    sort?: string;
    /** 兼容旧链接 */
    kind?: string;
  }
): SetGoodPriceListSortState {
  const metric = parseMetric(search.metric) ?? metricFromLegacySort(search.sort);
  const dir = parseDir(search.dir);

  if (metric != null) {
    return {
      metric,
      dir: dir ?? SET_GOOD_PRICE_DEFAULT_DIR,
      neutral: false,
    };
  }
  return { ...SET_GOOD_PRICE_NEUTRAL_SORT_STATE };
}

export function setGoodPriceSortStateToQueryEntries(state: SetGoodPriceListSortState): {
  metric?: string;
  dir?: string;
} {
  if (state.neutral) return {};
  return { metric: state.metric, dir: state.dir };
}

function sortMetricValue(
  item: SetGoodPriceListItem,
  metric: SetGoodPriceSortMetric
): number | null {
  const price = item.priceNewCny;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
    if (metric === "discount") {
      return discountFoldVsOfficialPrice(null, item.bricktimeOfficialPrice);
    }
    return null;
  }
  if (metric === "discount") {
    return discountFoldVsOfficialPrice(price, item.bricktimeOfficialPrice);
  }
  if (metric === "per_piece") {
    const { numParts } = item;
    if (typeof numParts !== "number" || !Number.isFinite(numParts) || numParts <= 0) {
      return null;
    }
    return price / numParts;
  }
  return price;
}

export function sortSetGoodPriceListItems(
  items: SetGoodPriceListItem[],
  state: SetGoodPriceListSortState
): SetGoodPriceListItem[] {
  const metric = state.metric;
  const dir = state.dir;
  const mul = dir === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const tie = a.setNum.localeCompare(b.setNum);
    const va =
      sortMetricValue(a, metric) ?? (dir === "asc" ? NULL_ASC : NULL_DESC);
    const vb =
      sortMetricValue(b, metric) ?? (dir === "asc" ? NULL_ASC : NULL_DESC);
    const cmp = (va - vb) * mul;
    return cmp !== 0 ? cmp : tie;
  });
}

export function setGoodPriceSortMetricLabel(metric: SetGoodPriceSortMetric): string {
  if (metric === "per_piece") return "单价/片";
  if (metric === "discount") return "折扣力度";
  return "总价";
}

export function setGoodPriceSortDirLabel(dir: SetGoodPriceSortDir): string {
  return dir === "asc" ? "正序" : "倒序";
}

/** 重复点击同一指标：升序 → 降序；切换指标：从升序开始 */
export function nextSetGoodPriceMetricClick(
  clickMetric: SetGoodPriceSortMetric,
  s: SetGoodPriceListSortState
): SetGoodPriceListSortState {
  if (s.neutral || clickMetric !== s.metric) {
    return { metric: clickMetric, dir: "asc", neutral: false };
  }
  return {
    metric: clickMetric,
    dir: s.dir === "asc" ? "desc" : "asc",
    neutral: false,
  };
}

export function setGoodPriceMetricTriggerLabel(state: SetGoodPriceListSortState): string {
  const metricLabel = setGoodPriceSortMetricLabel(state.metric);
  if (state.neutral) return metricLabel;
  const dirHint = state.dir === "asc" ? "↑" : "↓";
  return `${metricLabel} ${dirHint}`;
}

export function setGoodPriceMetricTriggerAriaLabel(state: SetGoodPriceListSortState): string {
  const metricLabel = setGoodPriceSortMetricLabel(state.metric);
  if (state.neutral) return `排序：${metricLabel}，默认升序，展开选项`;
  const dirZh = state.dir === "asc" ? "升序" : "降序";
  return `排序：${metricLabel}，${dirZh}，重复点击切换方向`;
}
