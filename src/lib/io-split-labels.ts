/** 分包 / 分包方案展示名：分包1、分包2… */
export function ioSplitPackageLabel(oneBasedIndex: number): string {
  const n = Math.max(1, Math.floor(oneBasedIndex));
  return `分包${n}`;
}

export function normalizeIoSplitBatchLabels<T extends { label: string }>(
  batches: T[]
): T[] {
  return batches.map((b, i) => ({ ...b, label: ioSplitPackageLabel(i + 1) }));
}
