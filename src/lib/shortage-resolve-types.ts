import type { PartsSheetTag } from "@/lib/parts-sheet-tags";

export type ShortageResolveItem = {
  lineNumber: number;
  partNum: string;
  colorId: number;
  /** LEGO element_id；导入时优先用于对照目录 part_num / color_id */
  elementId?: string | null;
  /** Studio 零件清单 LdrawId（无 .dat），用于与 .io 解析的 LDraw 零件名对照 */
  ldrawPartNum?: string | null;
  quantity: number;
  /** @deprecated 请使用 {@link ShortageResolveItem.gdsUnitPrice}；旧 JSON 或未走 GDS 解析时可能仍有值 */
  gobricksUnitPrice?: string | null;
  /** 高砖单价（元）；配货/缺件由高砖同步写入 */
  gdsUnitPrice?: string | null;
  gdsItemId?: string | null;
  gdsColorId?: string | null;
  gdsPicture?: string | null;
  gdsCaption?: string | null;
  gdsCaptionEn?: string | null;
  gdsShelfState?: string | null;
  gdsLegoColorId?: string | null;
  /** 高砖中文色名 */
  gdsColorNameZh?: string | null;
  /** 高砖英文色名 */
  gdsColorNameEn?: string | null;
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
