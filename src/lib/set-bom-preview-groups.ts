export type SetBomPreviewLine = {
  partNum: string;
  partName: string | null;
  partCatName: string | null;
  colorId: number;
  colorName: string | null;
  colorRgb: string | null;
  quantity: number;
  imgUrl: string | null;
  isSpare: boolean;
};

export type SetBomPreviewGroupMode = "category" | "color";

export type SetBomPreviewPartRow = {
  partNum: string;
  partName: string | null;
  colorId: number;
  colorName: string | null;
  colorRgb: string | null;
  quantity: number;
  imgUrl: string | null;
  isSpare: boolean;
};

export type SetBomPreviewGroup = {
  key: string;
  label: string;
  colorRgb: string | null;
  /** 组内数量最多且有图的零件缩略图，供列表行展示 */
  thumbUrl: string | null;
  pieceQty: number;
  lineCount: number;
  parts: SetBomPreviewPartRow[];
};

function spareFromRest(rest: string): boolean {
  return rest.includes("备用件");
}

export function shortageResolveItemsToBomPreviewLines(
  items: readonly {
    partNum: string;
    partName: string | null;
    partCatName: string | null;
    colorId: number;
    colorName: string | null;
    quantity: number;
    imgUrl: string | null;
    rest: string;
  }[],
  colorRgbById?: ReadonlyMap<number, string | null>
): SetBomPreviewLine[] {
  return items.map((item) => ({
    partNum: item.partNum,
    partName: item.partName,
    partCatName: item.partCatName,
    colorId: item.colorId,
    colorName: item.colorName,
    colorRgb: colorRgbById?.get(item.colorId) ?? null,
    quantity: item.quantity,
    imgUrl: item.imgUrl?.trim() || null,
    isSpare: spareFromRest(item.rest),
  }));
}

function lineToPartRow(line: SetBomPreviewLine): SetBomPreviewPartRow {
  return {
    partNum: line.partNum,
    partName: line.partName,
    colorId: line.colorId,
    colorName: line.colorName,
    colorRgb: line.colorRgb,
    quantity: line.quantity,
    imgUrl: line.imgUrl,
    isSpare: line.isSpare,
  };
}

function comparePartLinesByQty(a: SetBomPreviewLine, b: SetBomPreviewLine): number {
  const byQty = b.quantity - a.quantity;
  if (byQty !== 0) return byQty;
  return a.partNum.localeCompare(b.partNum, "en");
}

function pickGroupThumbUrl(lines: readonly SetBomPreviewLine[]): string | null {
  const sorted = lines.slice().sort(comparePartLinesByQty);
  for (const line of sorted) {
    const url = line.imgUrl?.trim();
    if (url) return url;
  }
  return null;
}

function compareGroups(a: SetBomPreviewGroup, b: SetBomPreviewGroup): number {
  const byQty = b.pieceQty - a.pieceQty;
  if (byQty !== 0) return byQty;
  return a.label.localeCompare(b.label, "zh-Hans-CN");
}

function finalizeGroups(
  map: Map<string, { label: string; colorRgb: string | null; lines: SetBomPreviewLine[] }>,
  mode: SetBomPreviewGroupMode
): SetBomPreviewGroup[] {
  return [...map.entries()]
    .map(([key, g]) => {
      const pieceQty = g.lines.reduce((s, l) => s + l.quantity, 0);
      return {
        key,
        label: g.label,
        colorRgb: g.colorRgb,
        thumbUrl: pickGroupThumbUrl(g.lines),
        pieceQty,
        lineCount: g.lines.length,
        parts: g.lines.slice().sort(comparePartLinesByQty).map(lineToPartRow),
      };
    })
    .sort(compareGroups);
}

export function groupSetBomPreviewLines(
  lines: readonly SetBomPreviewLine[],
  mode: SetBomPreviewGroupMode
): SetBomPreviewGroup[] {
  const map = new Map<string, { label: string; colorRgb: string | null; lines: SetBomPreviewLine[] }>();

  for (const line of lines) {
    if (mode === "category") {
      const label = line.partCatName?.trim() || "未分类";
      const key = `cat:${label}`;
      const cur = map.get(key);
      if (cur) cur.lines.push(line);
      else map.set(key, { label, colorRgb: null, lines: [line] });
    } else {
      const label = line.colorName?.trim() || `颜色 ${line.colorId}`;
      const key = `color:${line.colorId}`;
      const cur = map.get(key);
      if (cur) cur.lines.push(line);
      else map.set(key, { label, colorRgb: line.colorRgb, lines: [line] });
    }
  }

  return finalizeGroups(map, mode);
}

export function sumSetBomPreviewPieceQty(lines: readonly SetBomPreviewLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}
