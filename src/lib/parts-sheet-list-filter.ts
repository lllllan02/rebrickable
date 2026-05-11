import { PARTS_SHEET_TAG_LABELS, type PartsSheetTag } from "@/lib/parts-sheet-tags";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 与零件表列表相同的粗粒度分类筛选 */
export type SheetListFilter = "all" | PartsSheetTag | "plain";

export function rowMatchesSheetListFilter(r: ShortageResolveItem, f: SheetListFilter): boolean {
  if (f === "all") return true;
  if (!r.partFound) return false;
  if (f === "plain") return r.sheetTags.length === 0;
  return r.sheetTags.includes(f);
}

/** 根据当前数据生成可选筛选项（无某类则不显示该按钮） */
export function getSheetFilterOptionsFromItems(
  items: ShortageResolveItem[]
): { id: SheetListFilter; label: string }[] {
  let printed = false;
  let minifig = false;
  let sticker = false;
  let plain = false;
  for (const r of items) {
    if (!r.partFound) continue;
    if (r.sheetTags.includes("printed")) printed = true;
    if (r.sheetTags.includes("minifig")) minifig = true;
    if (r.sheetTags.includes("sticker")) sticker = true;
    if (r.sheetTags.length === 0) plain = true;
  }
  const opts: { id: SheetListFilter; label: string }[] = [{ id: "all", label: "全部" }];
  if (printed) opts.push({ id: "printed", label: PARTS_SHEET_TAG_LABELS.printed });
  if (minifig) opts.push({ id: "minifig", label: PARTS_SHEET_TAG_LABELS.minifig });
  if (sticker) opts.push({ id: "sticker", label: PARTS_SHEET_TAG_LABELS.sticker });
  if (plain) opts.push({ id: "plain", label: "普通" });
  return opts;
}
