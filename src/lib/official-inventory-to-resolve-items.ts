import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 套装详情页从 `inventory_parts` 读出的行（已与 parts / colors 关联） */
export type OfficialInventoryDbRow = {
  partNum: string;
  name: string;
  colorId: number;
  colorName: string;
  quantity: number;
  isSpare: boolean;
  imgUrl: string | null;
  partCatName: string | null;
};

export function officialInventoryRowsToShortageResolveItems(
  lines: OfficialInventoryDbRow[]
): ShortageResolveItem[] {
  return lines.map((l, i) => {
    const img =
      typeof l.imgUrl === "string" && l.imgUrl.trim().length > 0 ? l.imgUrl.trim() : null;
    return {
      lineNumber: i + 1,
      partNum: l.partNum,
      colorId: l.colorId,
      quantity: l.quantity,
      rest: l.isSpare ? "备用件" : "",
      partFound: true,
      partName: l.name,
      partCatName: l.partCatName,
      isPrinted: false,
      sheetTags: [],
      colorName: l.colorName,
      elementKnown: true,
      imgUrl: img,
      imgSource: img ? ("color" as const) : null,
    };
  });
}
