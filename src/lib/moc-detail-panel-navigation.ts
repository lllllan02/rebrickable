/** MOC 详情下半区：零件表 ↔ 复刻阶段 */
export type MocDetailPanel = "parts" | "phases";

export const MOC_DETAIL_PANEL_HASH: Record<MocDetailPanel, string> = {
  parts: "moc-parts-sheet-tools",
  phases: "moc-replicate-phases",
};

/** 零件表子 Tab 的 hash 也视为「零件表」面板 */
export function resolveMocDetailPanelFromHash(fragment: string): MocDetailPanel | null {
  const id = fragment.replace(/^#/, "");
  if (!id) return null;
  if (id === MOC_DETAIL_PANEL_HASH.phases) return "phases";
  return "parts";
}

export function replaceUrlHashForMocDetailPanel(panel: MocDetailPanel) {
  if (typeof window === "undefined") return;
  const next = `#${MOC_DETAIL_PANEL_HASH[panel]}`;
  if (window.location.hash === next) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
}
