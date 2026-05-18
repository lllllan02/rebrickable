import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 配货/修改表行：高砖单价（元）× 数量之和 */
export function sumPartsSheetGobricksTotalCny(
  items: readonly ShortageResolveItem[] | undefined
): number {
  if (!items?.length) return 0;
  let s = 0;
  for (const r of items) {
    const raw = ((r.gdsUnitPrice ?? r.gobricksUnitPrice) ?? "").trim().replace(/,/g, "");
    const u = Number(raw);
    if (!Number.isFinite(u) || u < 0) continue;
    const q = Number.isFinite(r.quantity) ? r.quantity : 0;
    if (!Number.isFinite(q) || q <= 0) continue;
    s += u * q;
  }
  return Math.round(s * 1e4) / 1e4;
}
