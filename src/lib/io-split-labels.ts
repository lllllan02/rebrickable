import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 分包 / 分包方案展示名：分包1、分包2… */
export function ioSplitPackageLabel(oneBasedIndex: number): string {
  const n = Math.max(1, Math.floor(oneBasedIndex));
  return `分包${n}`;
}

/** 按颜色分包时的包名：优先高砖/本地颜色中文名 */
export function colorSplitBatchLabel(items: ShortageResolveItem[], colorId: number): string {
  for (const row of items) {
    const zh = row.gdsColorNameZh?.trim();
    if (zh) return zh;
    const name = row.colorName?.trim();
    if (name) return name;
  }
  return `颜色 ${colorId}`;
}

/**
 * 补全空包名；`forceNumbered` 时一律改为分包1、分包2…（仅用于需顺序命名的场景）。
 */
export function normalizeIoSplitBatchLabels<T extends { label: string }>(
  batches: T[],
  options?: { forceNumbered?: boolean }
): T[] {
  return batches.map((b, i) => {
    if (options?.forceNumbered) {
      return { ...b, label: ioSplitPackageLabel(i + 1) };
    }
    const trimmed = b.label.trim();
    return { ...b, label: trimmed || ioSplitPackageLabel(i + 1) };
  });
}
