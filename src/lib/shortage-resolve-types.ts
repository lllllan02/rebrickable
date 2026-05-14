import type { PartsSheetTag } from "@/lib/parts-sheet-tags";

export type ShortageResolveItem = {
  lineNumber: number;
  partNum: string;
  colorId: number;
  quantity: number;
  /** 高砖接口 `info.price` / `eshop_price`（元）；无或未存时省略 */
  gobricksUnitPrice?: string | null;
  rest: string;
  partFound: boolean;
  partName: string | null;
  /** Rebrickable 零件大类英文名（如 Minifigure, Head），未收录时为 null */
  partCatName: string | null;
  /** 零件关系表中 rel_type 为 P 的子件（印于基件），与零件页「印刷件」筛选一致 */
  isPrinted: boolean;
  /** 用于列表展示与筛选的简化标签 */
  sheetTags: PartsSheetTag[];
  colorName: string | null;
  elementKnown: boolean;
  imgUrl: string | null;
  imgSource: "color" | "part" | null;
};
