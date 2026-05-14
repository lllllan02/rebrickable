/**
 * 将缺件表行序列化为与 {@link parseShortageCsv} 兼容的文本行（颜色列带前导单引号，便于 Excel）。
 * 列为：Part、Color、Quantity、高砖单价（可空）、备注。
 */

import { stripSheetRowReplacedMarker } from "@/lib/sheet-row-replaced-marker";

export type ShortageCsvSerializeRow = {
  partNum: string;
  colorId: number;
  quantity: number;
  /** 高砖网店单价（元）；无则省略或空第四列 */
  gobricksUnitPrice?: string | null;
  gdsUnitPrice?: string | null;
  rest: string;
};

export function serializeShortageCsvLine(r: ShortageCsvSerializeRow): string {
  const colorField = `'${r.colorId}`;
  const priceRaw = ((r.gdsUnitPrice ?? r.gobricksUnitPrice) ?? "").trim();
  const restOut = stripSheetRowReplacedMarker(r.rest);
  return `${r.partNum},${colorField},${r.quantity},${priceRaw},${restOut}`;
}

export function serializeShortageCsv(
  rows: ShortageCsvSerializeRow[],
  opts?: { includeHeader?: boolean }
): string {
  const lines: string[] = [];
  if (opts?.includeHeader) {
    lines.push("Part,Color,Quantity,高砖单价,备注");
  }
  for (const r of rows) {
    lines.push(serializeShortageCsvLine(r));
  }
  return lines.join("\n");
}
