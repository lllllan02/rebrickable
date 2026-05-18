/** 主场景步骤范围展示（不含「基础层」，步骤从 1 起） */
export function formatIoMainStepRange(from: number, to: number): string {
  const lo = from <= 0 ? 1 : from;
  const hi = to <= 0 ? 1 : to;
  if (lo === hi) return `步骤 ${lo}`;
  return `步骤 ${lo}–${hi}`;
}

/** 主场景单步展示（stepIndex 为 0 时按步骤 1 显示） */
export function formatIoMainStepLabel(stepIndex: number, title?: string | null): string {
  const n = Math.max(1, stepIndex);
  const t = title?.trim();
  if (t && t !== `步骤 ${stepIndex}` && t !== "基础层") {
    return `步骤 ${n} · ${t}`;
  }
  return `步骤 ${n}`;
}

/** 多步列表（仅展示 stepIndex ≥ 1） */
export function formatIoMainStepIndexList(indexes: number[]): string {
  const sorted = [...new Set(indexes.filter((i) => i > 0))].sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  return sorted.map((i) => `步骤 ${i}`).join("、");
}

/** 手动分包配置：UI 只选步骤 ≥1，基础层零件并入第一个有步骤的分包 */
export function buildManualIoSplitGroups(
  groups: { label: string; stepIndexes: number[] }[],
  hasBaseLayerStep: boolean
): { label: string; stepIndexes: number[] }[] {
  const built = groups
    .map((g) => ({
      label: g.label,
      stepIndexes: [...new Set(g.stepIndexes.filter((idx) => idx > 0))].sort((a, b) => a - b),
    }))
    .filter((g) => g.stepIndexes.length > 0);

  if (hasBaseLayerStep && built.length > 0) {
    const first = built[0]!;
    built[0] = {
      ...first,
      stepIndexes: [0, ...first.stepIndexes.filter((idx) => idx !== 0)].sort((a, b) => a - b),
    };
  }

  return built;
}
