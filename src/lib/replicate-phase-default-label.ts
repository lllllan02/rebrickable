/** 新建复刻阶段的默认名称（已有 n 条则下一条为 n+1） */
export function replicatePhaseDefaultLabel(existingCount: number): string {
  const n = Math.max(0, Math.floor(existingCount)) + 1;
  return `阶段 ${n}`;
}
