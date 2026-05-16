/** MOC 详情零件表 Tab ↔ URL hash（详情内 Tab 切换会写入，勿单独据此滚动） */
export type MocPartsListTab = "full" | "fulfillment" | "shortage" | "official";

export const MOC_PARTS_TAB_HASH: Record<MocPartsListTab, string> = {
  full: "moc-parts-full",
  fulfillment: "moc-parts-fulfillment",
  shortage: "moc-parts-shortage",
  official: "moc-parts-official",
};

/** 仅列表跳转详情时携带；详情页读取后 replace 掉，避免 refresh 再次滚动 */
export const MOC_PARTS_SCROLL_QUERY = "partsScroll";

export function parseMocPartsScrollQuery(raw: string | null): MocPartsListTab | null {
  if (raw === "full" || raw === "fulfillment" || raw === "shortage" || raw === "official") return raw;
  return null;
}

export function mocPartsTabElementId(tab: MocPartsListTab): string {
  return MOC_PARTS_TAB_HASH[tab];
}

export function hashFragmentToMocPartsListTab(fragment: string): MocPartsListTab | null {
  const id = fragment.replace(/^#/, "");
  if (!id) return null;
  const hit = (Object.keys(MOC_PARTS_TAB_HASH) as MocPartsListTab[]).find((t) => MOC_PARTS_TAB_HASH[t] === id);
  return hit ?? null;
}

/** 列表「零件总数 / 缺 n」等链向详情零件表 Tab */
export function buildMocPartsDetailHref(detailPath: string, tab: MocPartsListTab): string {
  const hash = `#${MOC_PARTS_TAB_HASH[tab]}`;
  return `${detailPath}?${MOC_PARTS_SCROLL_QUERY}=${tab}${hash}`;
}
