import { sortFulfillmentItemsReplacedFirst } from "@/lib/sheet-row-replaced-marker";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type FulfillmentSheetSortKey = "qty" | "unit_price" | "line_total";
export type FulfillmentSheetSortDir = "asc" | "desc";

export type FulfillmentSheetSortState = {
  key: FulfillmentSheetSortKey;
  dir: FulfillmentSheetSortDir;
  /** 未显式排序：有修改行优先，其余保持原序 */
  neutral: boolean;
};

export const FULFILLMENT_SHEET_NEUTRAL_SORT_STATE: FulfillmentSheetSortState = {
  key: "qty",
  dir: "desc",
  neutral: true,
};

const NULL_ASC = 9.0e307;
const NULL_DESC = -1.0;

function parseSheetRowUnitPriceCny(
  row: Pick<ShortageResolveItem, "gdsUnitPrice" | "gobricksUnitPrice">
): number | null {
  const raw = ((row.gdsUnitPrice ?? row.gobricksUnitPrice) ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const u = Number(raw);
  if (!Number.isFinite(u) || u < 0) return null;
  return u;
}

function sheetRowQuantity(row: ShortageResolveItem): number | null {
  const q = row.quantity;
  if (!Number.isFinite(q) || q <= 0) return null;
  return q;
}

function sheetRowLineTotalCny(row: ShortageResolveItem): number | null {
  const u = parseSheetRowUnitPriceCny(row);
  const q = sheetRowQuantity(row);
  if (u === null || q === null) return null;
  return Math.round(u * q * 1e4) / 1e4;
}

function sortMetricValue(row: ShortageResolveItem, key: FulfillmentSheetSortKey): number | null {
  if (key === "qty") return sheetRowQuantity(row);
  if (key === "unit_price") return parseSheetRowUnitPriceCny(row);
  return sheetRowLineTotalCny(row);
}

export function sortFulfillmentSheetItems(
  items: readonly ShortageResolveItem[],
  state: FulfillmentSheetSortState
): ShortageResolveItem[] {
  if (state.neutral) {
    return sortFulfillmentItemsReplacedFirst(items);
  }
  const mul = state.dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const va =
      sortMetricValue(a, state.key) ?? (state.dir === "asc" ? NULL_ASC : NULL_DESC);
    const vb =
      sortMetricValue(b, state.key) ?? (state.dir === "asc" ? NULL_ASC : NULL_DESC);
    const cmp = (va - vb) * mul;
    if (cmp !== 0) return cmp;
    return a.lineNumber - b.lineNumber;
  });
}

/**
 * 重复点同一项：降序 → 升序 → 默认；点另一项：从降序开始。
 */
export function nextFulfillmentSheetSortOnPickerClick(
  clickKey: FulfillmentSheetSortKey,
  s: FulfillmentSheetSortState
): FulfillmentSheetSortState {
  if (s.neutral || clickKey !== s.key) {
    return { key: clickKey, dir: "desc", neutral: false };
  }
  if (s.dir === "desc") {
    return { key: clickKey, dir: "asc", neutral: false };
  }
  return { ...FULFILLMENT_SHEET_NEUTRAL_SORT_STATE };
}

export function fulfillmentSheetSortKeyLabel(key: FulfillmentSheetSortKey): string {
  if (key === "qty") return "零件数";
  if (key === "unit_price") return "单价";
  return "总价";
}

export function fulfillmentSheetSortSummaryKindLabel(state: FulfillmentSheetSortState): string {
  if (state.neutral) return "默认";
  return fulfillmentSheetSortKeyLabel(state.key);
}

export function fulfillmentSheetSortTriggerAriaLabel(state: FulfillmentSheetSortState): string {
  if (state.neutral) return "排序：默认（有修改行优先），展开选项";
  const dirZh = state.dir === "asc" ? "升序" : "降序";
  return `排序：${fulfillmentSheetSortKeyLabel(state.key)}，${dirZh}，展开选项`;
}
