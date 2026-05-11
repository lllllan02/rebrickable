/** 零件表列表用的粗粒度标签（由本地库分类名 + 印刷关系推断） */
export type PartsSheetTag = "printed" | "minifig" | "sticker";

export const PARTS_SHEET_TAG_LABELS: Record<PartsSheetTag, string> = {
  printed: "印刷件",
  minifig: "人仔",
  sticker: "贴纸",
};

export const PARTS_SHEET_TAG_ORDER: PartsSheetTag[] = ["printed", "minifig", "sticker"];

export function classifyPartsSheetRow(input: {
  partFound: boolean;
  partCatName: string | null;
  isPrinted: boolean;
}): PartsSheetTag[] {
  if (!input.partFound) return [];
  const tags: PartsSheetTag[] = [];
  if (input.isPrinted) tags.push("printed");
  const n = (input.partCatName ?? "").toLowerCase();
  if (n.includes("minifig")) tags.push("minifig");
  if (n.includes("sticker")) tags.push("sticker");
  return tags;
}

export function sheetTagsDisplayZh(tags: PartsSheetTag[]): string {
  if (tags.length === 0) return "";
  return tags.map((t) => PARTS_SHEET_TAG_LABELS[t]).join("、");
}
