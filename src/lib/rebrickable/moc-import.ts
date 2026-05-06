export type MocInventoryRow = {
  partNum: string;
  colorId: number;
  quantity: number;
  isSpare: boolean;
  partName?: string;
  colorName?: string;
  elementId?: string;
};

export type PartColorOption = {
  partNum: string;
  colorId: number;
};

export type FilteredMocRow = MocInventoryRow & {
  sourcePartNum: string;
  sourceColorId: number;
  status: "kept" | "color_replaced";
  note: string;
};

export type RejectedMocRow = MocInventoryRow & {
  reason: string;
};

export type MocInventoryParseResult = {
  rows: MocInventoryRow[];
  errors: string[];
};

const headerAliases = {
  partNum: ["part_num", "partnum", "part", "partnumber", "partid"],
  colorId: ["color_id", "colorid", "color", "colourid"],
  quantity: ["quantity", "qty", "count"],
  isSpare: ["is_spare", "isspare", "spare"],
  partName: ["part_name", "partname", "name"],
  colorName: ["color_name", "colorname", "colourname"],
  elementId: ["element_id", "elementid", "element"],
} as const;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function columnIndex(headers: string[], aliases: readonly string[]) {
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

export function parseMocInventoryCsv(text: string): MocInventoryParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { rows: [], errors: ["文件为空。"] };
  }

  const headers = parseCsvLine(lines[0]);
  const indexes = {
    partNum: columnIndex(headers, headerAliases.partNum),
    colorId: columnIndex(headers, headerAliases.colorId),
    quantity: columnIndex(headers, headerAliases.quantity),
    isSpare: columnIndex(headers, headerAliases.isSpare),
    partName: columnIndex(headers, headerAliases.partName),
    colorName: columnIndex(headers, headerAliases.colorName),
    elementId: columnIndex(headers, headerAliases.elementId),
  };
  const missing = [
    indexes.partNum < 0 ? "part_num" : null,
    indexes.colorId < 0 ? "color_id" : null,
    indexes.quantity < 0 ? "quantity" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    return { rows: [], errors: [`缺少必要列：${missing.join(", ")}。`] };
  }

  const rows: MocInventoryRow[] = [];
  const errors: string[] = [];

  for (const [lineIndex, line] of lines.slice(1).entries()) {
    const values = parseCsvLine(line);
    const lineNumber = lineIndex + 2;
    const partNum = values[indexes.partNum]?.trim();
    const colorId = Number(values[indexes.colorId]);
    const quantity = Number(values[indexes.quantity]);

    if (!partNum || !Number.isInteger(colorId) || !Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`第 ${lineNumber} 行无法识别 part_num/color_id/quantity。`);
      continue;
    }

    const spareValue = indexes.isSpare >= 0 ? values[indexes.isSpare]?.toLowerCase() : "";

    rows.push({
      partNum,
      colorId,
      quantity,
      isSpare: spareValue === "true" || spareValue === "1" || spareValue === "yes",
      partName: indexes.partName >= 0 ? values[indexes.partName] : undefined,
      colorName: indexes.colorName >= 0 ? values[indexes.colorName] : undefined,
      elementId: indexes.elementId >= 0 ? values[indexes.elementId] : undefined,
    });
  }

  return { rows, errors };
}

export function filterMocInventory(rows: MocInventoryRow[], options: PartColorOption[]) {
  const colorsByPart = new Map<string, Set<number>>();

  for (const option of options) {
    const colors = colorsByPart.get(option.partNum) ?? new Set<number>();
    colors.add(option.colorId);
    colorsByPart.set(option.partNum, colors);
  }

  const filtered: FilteredMocRow[] = [];
  const rejected: RejectedMocRow[] = [];

  for (const row of rows) {
    const colors = colorsByPart.get(row.partNum);

    if (!colors || colors.size === 0) {
      rejected.push({ ...row, reason: "本地索引没有这个零件的任何可用配色。" });
      continue;
    }

    if (colors.has(row.colorId)) {
      filtered.push({
        ...row,
        sourcePartNum: row.partNum,
        sourceColorId: row.colorId,
        status: "kept",
        note: "保留原始零件和配色。",
      });
      continue;
    }

    const replacementColorId = [...colors].sort((left, right) => left - right)[0];
    filtered.push({
      ...row,
      colorId: replacementColorId,
      sourcePartNum: row.partNum,
      sourceColorId: row.colorId,
      status: "color_replaced",
      note: `原配色不可用，替换为同零件可用配色 ${replacementColorId}。`,
    });
  }

  return { filtered, rejected };
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function filteredMocRowsToCsv(rows: FilteredMocRow[]) {
  const header = [
    "part_num",
    "color_id",
    "quantity",
    "is_spare",
    "source_part_num",
    "source_color_id",
    "filter_status",
    "filter_note",
  ];
  const body = rows.map((row) =>
    [
      row.partNum,
      row.colorId,
      row.quantity,
      row.isSpare,
      row.sourcePartNum,
      row.sourceColorId,
      row.status,
      row.note,
    ]
      .map(csvValue)
      .join(","),
  );

  return [header.join(","), ...body].join("\n");
}

export function rejectedMocRowsToCsv(rows: RejectedMocRow[]) {
  const header = ["part_num", "color_id", "quantity", "is_spare", "reason"];
  const body = rows.map((row) =>
    [row.partNum, row.colorId, row.quantity, row.isSpare, row.reason].map(csvValue).join(","),
  );

  return [header.join(","), ...body].join("\n");
}
