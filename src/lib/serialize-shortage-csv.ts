/**
 * 将零件表行序列化为与 {@link parseShortageCsv} 兼容的文本行（颜色列带前导单引号，便于 Excel）。
 */

export type ShortageCsvSerializeRow = {
  partNum: string;
  colorId: number;
  quantity: number;
  rest: string;
};

export function serializeShortageCsvLine(r: ShortageCsvSerializeRow): string {
  const colorField = `'${r.colorId}`;
  return `${r.partNum},${colorField},${r.quantity},${r.rest}`;
}

export function serializeShortageCsv(
  rows: ShortageCsvSerializeRow[],
  opts?: { includeHeader?: boolean }
): string {
  const lines: string[] = [];
  if (opts?.includeHeader) {
    lines.push("Part,Color,Quantity");
  }
  for (const r of rows) {
    lines.push(serializeShortageCsvLine(r));
  }
  return lines.join("\n");
}
