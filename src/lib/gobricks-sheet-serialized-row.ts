/**
 * 高砖 `lego2ItemList` 解析后的行（尚未走本地目录 enrich），供写入配货/缺件分支前做 RB 对齐。
 */
export type GobricksSheetSerializedRow = {
  partNum: string;
  colorId: number;
  quantity: number;
  rest: string;
  /** 与 `gdsUnitPrice` 对齐，兼容旧 CSV/导出 */
  gobricksUnitPrice: string | null;
  gdsItemId: string | null;
  gdsColorId: string | null;
  gdsPicture: string | null;
  gdsUnitPrice: string | null;
  gdsCaption: string | null;
  gdsCaptionEn: string | null;
  gdsShelfState: string | null;
  gdsLegoColorId: string | null;
  /** 高砖侧中文色名（color_data.name） */
  gdsColorNameZh?: string | null;
  /** 高砖侧英文色名（color_data.name_en） */
  gdsColorNameEn?: string | null;
};
