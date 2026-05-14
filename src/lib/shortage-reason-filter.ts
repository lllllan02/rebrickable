/**
 * 缺件表「原因」与高砖 {@link shortageSerializeRowsFromGobricksPayload} 写入的 `rest` 备注一致。
 * 多原因以 `·` 连接；筛选时一行可匹配多个原因类。
 */

import { stripSheetRowReplacedMarker } from "@/lib/sheet-row-replaced-marker";

export type ShortageReasonCategoryId =
  | "no_match"
  | "off_shelf"
  | "color_mismatch"
  | "inventory_short"
  | "buy_limit";

export type ShortageReasonFilterId = "all" | ShortageReasonCategoryId | "other";

/** 与高砖 bump 文案一致，用于子串匹配 */
export const SHORTAGE_REASON_CATEGORY_DEFS: readonly {
  id: ShortageReasonCategoryId;
  needle: string;
  label: string;
}[] = [
  { id: "no_match", needle: "零件未匹配", label: "零件未匹配" },
  { id: "off_shelf", needle: "下架", label: "下架" },
  { id: "color_mismatch", needle: "颜色未匹配", label: "颜色未匹配" },
  { id: "inventory_short", needle: "库存不足", label: "库存不足" },
  { id: "buy_limit", needle: "超限购", label: "超限购" },
] as const;

export function shortageReasonCategoriesInRest(rest: string): ShortageReasonCategoryId[] {
  const t = stripSheetRowReplacedMarker(rest).trim();
  if (!t) return [];
  const found: ShortageReasonCategoryId[] = [];
  for (const { id, needle } of SHORTAGE_REASON_CATEGORY_DEFS) {
    if (t.includes(needle)) found.push(id);
  }
  return found;
}

function isGobricksShortageReasonSegment(segment: string): boolean {
  const p = segment.trim();
  if (!p) return true;
  for (const { needle } of SHORTAGE_REASON_CATEGORY_DEFS) {
    if (p === needle) return true;
    if (needle === "超限购" && p.startsWith(needle)) return true;
  }
  return false;
}

/**
 * 去掉高砖缺件对照写入的 `rest` 原因片段（`·` 分隔；`超限购·N` 等同理），保留用户其它备注。
 * 用于缺件行更换为有货 SKU 并并入配货表后，列表/详情不再展示缺件原因。
 */
export function stripShortageReasonTextFromRest(rest: string): string {
  const t = stripSheetRowReplacedMarker(rest).trim();
  if (!t) return "";
  const parts = t.split("·").map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((p) => !isGobricksShortageReasonSegment(p));
  return kept.join("·").trim();
}

export function rowMatchesShortageReasonFilter(
  rest: string,
  filter: ShortageReasonFilterId
): boolean {
  if (filter === "all") return true;
  const cats = shortageReasonCategoriesInRest(rest);
  if (filter === "other") return cats.length === 0;
  return cats.includes(filter);
}

export type ShortageReasonFilterOption = { id: ShortageReasonFilterId; label: string; count: number };

/** 仅统计「当前列表」内各原因下的行数（一行可计入多个原因） */
export function getShortageReasonFilterOptionsFromRests(rests: readonly string[]): ShortageReasonFilterOption[] {
  const counts = new Map<ShortageReasonFilterId, number>();
  counts.set("all", rests.length);
  for (const { id } of SHORTAGE_REASON_CATEGORY_DEFS) {
    counts.set(id, 0);
  }
  counts.set("other", 0);

  for (const rest of rests) {
    const cats = shortageReasonCategoriesInRest(rest);
    if (cats.length === 0) {
      counts.set("other", (counts.get("other") ?? 0) + 1);
    } else {
      for (const c of cats) {
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
  }

  const opts: ShortageReasonFilterOption[] = [
    { id: "all", label: "全部", count: counts.get("all") ?? 0 },
  ];
  for (const { id, label } of SHORTAGE_REASON_CATEGORY_DEFS) {
    const n = counts.get(id) ?? 0;
    if (n > 0) opts.push({ id, label, count: n });
  }
  const otherN = counts.get("other") ?? 0;
  if (otherN > 0) {
    opts.push({ id: "other", label: "其他 / 无高砖标注", count: otherN });
  }
  return opts;
}
