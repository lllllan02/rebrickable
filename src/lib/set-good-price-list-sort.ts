import { discountFoldVsOfficialPrice } from "@/lib/set-good-price-format";

export type SetGoodPriceSortKind = "new" | "used";
export type SetGoodPriceSortMetric = "price" | "per_piece" | "discount";
export type SetGoodPriceSortDir = "asc" | "desc";

export const SET_GOOD_PRICE_DEFAULT_KIND: SetGoodPriceSortKind = "new";
export const SET_GOOD_PRICE_DEFAULT_METRIC: SetGoodPriceSortMetric = "price";
export const SET_GOOD_PRICE_DEFAULT_DIR: SetGoodPriceSortDir = "asc";

export type SetGoodPriceListSortState = {
  kind: SetGoodPriceSortKind;
  metric: SetGoodPriceSortMetric;
  dir: SetGoodPriceSortDir;
  /** URL 未带完整排序参数时使用默认（全新 · 总价 · 低到高） */
  neutral: boolean;
};

export const SET_GOOD_PRICE_NEUTRAL_SORT_STATE: SetGoodPriceListSortState = {
  kind: SET_GOOD_PRICE_DEFAULT_KIND,
  metric: SET_GOOD_PRICE_DEFAULT_METRIC,
  dir: SET_GOOD_PRICE_DEFAULT_DIR,
  neutral: true,
};

const NULL_ASC = 9.0e307;
const NULL_DESC = -1.0;

export type SetGoodPriceListItem = {
  setNum: string;
  priceNewCny: number | null;
  priceUsedCny: number | null;
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
};

function parseKind(raw: string | undefined): SetGoodPriceSortKind | null {
  if (raw === "new" || raw === "used") return raw;
  return null;
}

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
    kind?: string;
    metric?: string;
    dir?: string;
    sort?: string;
  }
): SetGoodPriceListSortState {
  const kind = parseKind(search.kind);
  const metric = parseMetric(search.metric) ?? metricFromLegacySort(search.sort);
  const dir = parseDir(search.dir);

  if (kind != null && metric != null) {
    return {
      kind,
      metric,
      dir: dir ?? SET_GOOD_PRICE_DEFAULT_DIR,
      neutral: false,
    };
  }
  return { ...SET_GOOD_PRICE_NEUTRAL_SORT_STATE };
}

export function setGoodPriceSortStateToQueryEntries(state: SetGoodPriceListSortState): {
  kind?: string;
  metric?: string;
  dir?: string;
} {
  if (state.neutral) return {};
  return { kind: state.kind, metric: state.metric, dir: state.dir };
}

function priceForKind(item: SetGoodPriceListItem, kind: SetGoodPriceSortKind): number | null {
  const p = kind === "new" ? item.priceNewCny : item.priceUsedCny;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0) return null;
  return p;
}

function sortMetricValue(
  item: SetGoodPriceListItem,
  kind: SetGoodPriceSortKind,
  metric: SetGoodPriceSortMetric
): number | null {
  const price = priceForKind(item, kind);
  if (metric === "discount") {
    return discountFoldVsOfficialPrice(price, item.bricktimeOfficialPrice);
  }
  if (price == null) return null;
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
  const kind = state.kind;
  const metric = state.metric;
  const dir = state.dir;
  const mul = dir === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const tie = a.setNum.localeCompare(b.setNum);
    const va =
      sortMetricValue(a, kind, metric) ?? (dir === "asc" ? NULL_ASC : NULL_DESC);
    const vb =
      sortMetricValue(b, kind, metric) ?? (dir === "asc" ? NULL_ASC : NULL_DESC);
    const cmp = (va - vb) * mul;
    return cmp !== 0 ? cmp : tie;
  });
}

export function setGoodPriceSortKindLabel(kind: SetGoodPriceSortKind): string {
  return kind === "new" ? "全新" : "二手";
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
    return { kind: s.kind, metric: clickMetric, dir: "asc", neutral: false };
  }
  return {
    kind: s.kind,
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
