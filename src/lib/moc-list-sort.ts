import { asc, desc, sql } from "drizzle-orm";

import { buildSavedPartsSheets } from "@/db/schema";

export type MocListSortKey = "parts" | "price" | "added";
export type MocListSortDir = "asc" | "desc";

export const MOC_LIST_DEFAULT_SORT_KEY: MocListSortKey = "added";
export const MOC_LIST_DEFAULT_SORT_DIR: MocListSortDir = "desc";

/** URL 未带 sort/dir 时：列表仍按加入时间降序，但与「显式加入时间·降序」区分（用于同一项三段循环） */
export type MocListSortState = {
  key: MocListSortKey;
  dir: MocListSortDir;
  neutral: boolean;
};

export const MOC_LIST_NEUTRAL_SORT_STATE: MocListSortState = {
  key: MOC_LIST_DEFAULT_SORT_KEY,
  dir: MOC_LIST_DEFAULT_SORT_DIR,
  neutral: true,
};

const PRICE_NULL_ASC = 9.0e307;
const PRICE_NULL_DESC = -1.0;

/** 与 `coalesce(first_saved_at, updated_at)` 一致，用于「加入时间」排序 */
const addedAtExpr = sql`coalesce(${buildSavedPartsSheets.firstSavedAt}, ${buildSavedPartsSheets.updatedAt})`;

export function parseMocListSort(sortRaw: string | undefined, dirRaw: string | undefined): MocListSortState {
  const hasSort = sortRaw === "parts" || sortRaw === "price" || sortRaw === "added";
  const hasDir = dirRaw === "asc" || dirRaw === "desc";
  if (!hasSort || !hasDir) {
    return { ...MOC_LIST_NEUTRAL_SORT_STATE };
  }
  return { key: sortRaw, dir: dirRaw, neutral: false };
}

/** 写入查询串：中性不写 sort/dir */
export function mocSortStateToQueryEntries(state: MocListSortState): { sort?: string; dir?: string } {
  if (state.neutral) return {};
  return { sort: state.key, dir: state.dir };
}

export function mocListOrderBy(key: MocListSortKey, dir: MocListSortDir) {
  const tie = asc(buildSavedPartsSheets.subjectId);
  if (key === "parts") {
    return dir === "asc"
      ? [asc(buildSavedPartsSheets.totalPartQty), tie]
      : [desc(buildSavedPartsSheets.totalPartQty), tie];
  }
  if (key === "price") {
    const priceAsc = asc(sql`(coalesce(${buildSavedPartsSheets.gobricksGdsPriceCny}, ${PRICE_NULL_ASC}))`);
    const priceDesc = desc(sql`(coalesce(${buildSavedPartsSheets.gobricksGdsPriceCny}, ${PRICE_NULL_DESC}))`);
    return dir === "asc" ? [priceAsc, tie] : [priceDesc, tie];
  }
  return dir === "asc" ? [asc(addedAtExpr), tie] : [desc(addedAtExpr), tie];
}

export function mocListOrderByFromState(state: MocListSortState) {
  return mocListOrderBy(state.key, state.dir);
}

/**
 * 排序下拉只有三项；重复点同一项：正序 → 倒序 → 取消（中性 URL，列表仍为默认加入最新）
 * 点另一项：从该项的正序开始。
 */
export function nextMocListSortOnPickerClick(clickKey: MocListSortKey, s: MocListSortState): MocListSortState {
  if (s.neutral || clickKey !== s.key) {
    return { key: clickKey, dir: "asc", neutral: false };
  }
  if (s.dir === "asc") {
    return { key: clickKey, dir: "desc", neutral: false };
  }
  return { ...MOC_LIST_NEUTRAL_SORT_STATE };
}

/** 当前按哪一项排序（中性时列表等价于「加入时间」降序，文案仍显示该项名） */
export function mocListSortSummaryKindLabel(state: MocListSortState): string {
  if (state.neutral) return "加入时间";
  if (state.key === "parts") return "零件数";
  if (state.key === "price") return "总价";
  return "加入时间";
}

/** 供 `aria-label` 使用（读屏完整说明） */
export function mocListSortTriggerAriaLabel(state: MocListSortState): string {
  if (state.neutral) return "排序：默认按加入时间由新到旧，展开选项";
  const dirZh = state.dir === "asc" ? "正序" : "倒序";
  if (state.key === "parts") return `排序：零件数，${dirZh}，展开选项`;
  if (state.key === "price") return `排序：总价，${dirZh}，展开选项`;
  return `排序：加入时间，${dirZh}，展开选项`;
}
