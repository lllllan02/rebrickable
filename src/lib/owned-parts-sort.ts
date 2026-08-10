export type OwnedSortKey = "color" | "id" | "category" | "qty";
export type OwnedSortDir = "asc" | "desc";

export type OwnedSortState = {
  key: OwnedSortKey;
  dir: OwnedSortDir;
};

export const OWNED_SORT_KEYS: readonly OwnedSortKey[] = [
  "color",
  "id",
  "category",
  "qty",
] as const;

export const OWNED_DEFAULT_SORT: OwnedSortState = {
  key: "id",
  dir: "asc",
};

/** 首次点选某项时的默认方向 */
export function defaultOwnedSortDir(key: OwnedSortKey): OwnedSortDir {
  return key === "qty" ? "desc" : "asc";
}

export function parseOwnedSortState(
  sortRaw: string | undefined,
  dirRaw: string | undefined
): OwnedSortState {
  const key: OwnedSortKey =
    sortRaw === "color" ||
    sortRaw === "id" ||
    sortRaw === "category" ||
    sortRaw === "qty"
      ? sortRaw
      : OWNED_DEFAULT_SORT.key;

  if (dirRaw === "asc" || dirRaw === "desc") {
    return { key, dir: dirRaw };
  }
  // 仅有 sort、无 dir：用该项默认方向
  if (
    sortRaw === "color" ||
    sortRaw === "id" ||
    sortRaw === "category" ||
    sortRaw === "qty"
  ) {
    return { key, dir: defaultOwnedSortDir(key) };
  }
  return { ...OWNED_DEFAULT_SORT };
}

/** 写入查询串：默认 id+asc 不写参数 */
export function ownedSortStateToQuery(
  state: OwnedSortState
): { sort?: string; dir?: string } {
  if (
    state.key === OWNED_DEFAULT_SORT.key &&
    state.dir === OWNED_DEFAULT_SORT.dir
  ) {
    return {};
  }
  return { sort: state.key, dir: state.dir };
}

/**
 * 下拉重复点击：点新项 → 该项默认方向；点当前项 → 切换升降序
 */
export function nextOwnedSortOnPickerClick(
  clickKey: OwnedSortKey,
  state: OwnedSortState
): OwnedSortState {
  if (clickKey !== state.key) {
    return { key: clickKey, dir: defaultOwnedSortDir(clickKey) };
  }
  return { key: clickKey, dir: state.dir === "asc" ? "desc" : "asc" };
}

export function ownedSortLabel(
  sort: OwnedSortKey,
  view: "part" | "element"
): string {
  if (sort === "color") return "颜色";
  if (sort === "category") return "分类";
  if (sort === "qty") return "数量";
  return view === "element" ? "元素编号" : "零件编号";
}

export function ownedSortTriggerAriaLabel(
  state: OwnedSortState,
  view: "part" | "element"
): string {
  const dirZh = state.dir === "asc" ? "升序" : "降序";
  return `排序：${ownedSortLabel(state.key, view)}，${dirZh}，展开选项`;
}

/** @deprecated 使用 parseOwnedSortState */
export function parseOwnedSortParam(raw: string | undefined): OwnedSortKey {
  return parseOwnedSortState(raw, undefined).key;
}
