/**
 * 将缺件表行序列化为可再导入的 CSV（颜色列带前导单引号，便于 Excel）。
 * 列为：Part、Color、ElementId、Quantity、高砖单价（可空）、备注。
 */

import { stripSheetRowReplacedMarker } from "@/lib/sheet-row-replaced-marker";

/** 与 {@link parseRebrickablePartsCsv} / 缺件表导入识别的表头行一致。 */
export const SHORTAGE_CSV_HEADER_LINE = "Part,Color,ElementId,Quantity,高砖单价,备注";

export type ShortageCsvSerializeRow = {
  partNum: string;
  colorId: number;
  elementId?: string | null;
  /** 写入 Color 列的完整字段（通常含前导 `'`）；未指定时用乐高色 ID */
  colorField?: string;
  quantity: number;
  /** 高砖网店单价（元）；无则省略或空第四列 */
  gobricksUnitPrice?: string | null;
  gdsUnitPrice?: string | null;
  rest: string;
};

export function serializeShortageCsvLine(r: ShortageCsvSerializeRow): string {
  const colorField = r.colorField?.trim() || `'${r.colorId}`;
  const elementId = (r.elementId ?? "").trim();
  const priceRaw = ((r.gdsUnitPrice ?? r.gobricksUnitPrice) ?? "").trim();
  const restOut = stripSheetRowReplacedMarker(r.rest);
  return `${r.partNum},${colorField},${elementId},${r.quantity},${priceRaw},${restOut}`;
}

export function serializeShortageCsv(
  rows: ShortageCsvSerializeRow[],
  opts?: { includeHeader?: boolean }
): string {
  const lines: string[] = [];
  if (opts?.includeHeader) {
    lines.push(SHORTAGE_CSV_HEADER_LINE);
  }
  for (const r of rows) {
    lines.push(serializeShortageCsvLine(r));
  }
  return lines.join("\n");
}
