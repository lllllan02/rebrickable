export type MocInventoryRow = {
  partNum: string;
  colorId: number;
  quantity: number;
  isSpare: boolean;
};

function stripBom(text: string) {
  return text.replace(/^\uFEFF/, "");
}

function normHeaderKey(raw: string) {
  return stripBom(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function mergeRows(rows: MocInventoryRow[]): MocInventoryRow[] {
  const map = new Map<string, MocInventoryRow>();

  for (const row of rows) {
    const key = `${row.partNum}\0${row.colorId}\0${row.isSpare ? 1 : 0}`;
    const existing = map.get(key);

    if (existing) {
      existing.quantity += row.quantity;
    } else {
      map.set(key, { ...row });
    }
  }

  return [...map.values()];
}

function parseBoolSpare(raw: string): boolean {
  const v = raw.trim().toLowerCase();

  return v === "1" || v === "true" || v === "yes" || v === "y";
}

const CSV_PART_KEYS = new Set([
  "partnum",
  "partid",
  "part",
  "partno",
  "partnumber",
  "part_id",
  "itemid",
]);

const CSV_COLOR_KEYS = new Set(["colorid", "color", "color_id", "colourid", "colour"]);

const CSV_QTY_KEYS = new Set(["quantity", "qty", "num", "minqty", "count", "amount"]);

const CSV_SPARE_KEYS = new Set(["isspare", "is_spare", "spare"]);

function csvRoleForHeader(h: string): keyof MocInventoryRow | null {
  const k = normHeaderKey(h);

  if (CSV_PART_KEYS.has(k)) {
    return "partNum";
  }

  if (CSV_COLOR_KEYS.has(k)) {
    return "colorId";
  }

  if (CSV_QTY_KEYS.has(k)) {
    return "quantity";
  }

  if (CSV_SPARE_KEYS.has(k)) {
    return "isSpare";
  }

  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur.trim());

  return out.map((cell) => cell.replace(/^"|"$/g, ""));
}

export function parseMocInventoryCsv(content: string): MocInventoryRow[] {
  const text = stripBom(content);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV 至少需要表头行与一行数据。");
  }

  const headerCells = splitCsvLine(lines[0]);
  const roles = headerCells.map((h) => csvRoleForHeader(h));

  const partIdx = roles.indexOf("partNum");
  const colorIdx = roles.indexOf("colorId");
  const qtyIdx = roles.indexOf("quantity");
  const spareIdx = roles.indexOf("isSpare");

  if (partIdx < 0 || colorIdx < 0 || qtyIdx < 0) {
    throw new Error(
      "CSV 表头需包含零件号与颜色列（如 part_num / Part、color_id / Color）以及数量列（如 quantity / Qty）。",
    );
  }

  const rows: MocInventoryRow[] = [];

  for (let li = 1; li < lines.length; li += 1) {
    const cells = splitCsvLine(lines[li]);
    const partNum = (cells[partIdx] ?? "").trim();

    if (!partNum) {
      continue;
    }

    const colorRaw = (cells[colorIdx] ?? "").trim();
    const colorId = Number(colorRaw);

    if (!Number.isInteger(colorId)) {
      throw new Error(`第 ${li + 1} 行：颜色 ID「${colorRaw}」不是整数。`);
    }

    const qtyRaw = (cells[qtyIdx] ?? "").trim();
    const quantity = Number(qtyRaw);

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error(`第 ${li + 1} 行：数量「${qtyRaw}」须为正整数。`);
    }

    const isSpare =
      spareIdx >= 0 && cells[spareIdx] !== undefined && cells[spareIdx] !== ""
        ? parseBoolSpare(cells[spareIdx] ?? "")
        : false;

    rows.push({ partNum, colorId, quantity, isSpare });
  }

  return mergeRows(rows);
}

function readPartNum(obj: Record<string, unknown>): string | null {
  const candidates = [obj.partNum, obj.part_num, obj.Part, obj.part, obj.itemid, obj.ITEMID];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return c.trim();
    }

    if (typeof c === "number" && Number.isFinite(c)) {
      return String(c);
    }
  }

  return null;
}

function readColorId(obj: Record<string, unknown>): number | null {
  const candidates = [obj.colorId, obj.color_id, obj.Color, obj.COLOR, obj.color];

  for (const c of candidates) {
    if (typeof c === "number" && Number.isInteger(c)) {
      return c;
    }

    if (typeof c === "string" && c.trim()) {
      const n = Number(c.trim());

      if (Number.isInteger(n)) {
        return n;
      }
    }
  }

  return null;
}

function readQuantity(obj: Record<string, unknown>): number | null {
  const candidates = [obj.quantity, obj.qty, obj.Qty, obj.num, obj.count, obj.MINQTY];

  for (const c of candidates) {
    if (typeof c === "number" && Number.isInteger(c) && c > 0) {
      return c;
    }

    if (typeof c === "string" && c.trim()) {
      const n = Number(c.trim());

      if (Number.isInteger(n) && n > 0) {
        return n;
      }
    }
  }

  return null;
}

function readIsSpare(obj: Record<string, unknown>): boolean {
  const v = obj.isSpare ?? obj.is_spare ?? obj.spare;

  if (typeof v === "boolean") {
    return v;
  }

  if (typeof v === "string") {
    return parseBoolSpare(v);
  }

  if (typeof v === "number") {
    return v === 1;
  }

  return false;
}

function parseJsonPartArray(raw: unknown): MocInventoryRow[] {
  if (!Array.isArray(raw)) {
    throw new Error('JSON 中的零件列表应为数组，或包含 "parts" 数组字段。');
  }

  const rows: MocInventoryRow[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];

    if (!item || typeof item !== "object") {
      throw new Error(`零件列表第 ${i + 1} 项不是对象。`);
    }

    const obj = item as Record<string, unknown>;
    const partNum = readPartNum(obj);
    const colorId = readColorId(obj);
    const quantity = readQuantity(obj);

    if (!partNum) {
      throw new Error(`零件列表第 ${i + 1} 项缺少零件号（partNum / part_num 等）。`);
    }

    if (colorId === null) {
      throw new Error(`零件列表第 ${i + 1} 项缺少颜色 ID（colorId / color_id 等）。`);
    }

    if (quantity === null) {
      throw new Error(`零件列表第 ${i + 1} 项缺少正整数数量（quantity / qty 等）。`);
    }

    rows.push({
      partNum,
      colorId,
      quantity,
      isSpare: readIsSpare(obj),
    });
  }

  return mergeRows(rows);
}

export function parseMocInventoryJson(content: string): MocInventoryRow[] {
  let data: unknown;

  try {
    data = JSON.parse(stripBom(content)) as unknown;
  } catch {
    throw new Error("JSON 解析失败，请检查文件编码与语法。");
  }

  if (Array.isArray(data)) {
    return parseJsonPartArray(data);
  }

  if (data && typeof data === "object" && "parts" in data) {
    const partsVal = (data as { parts?: unknown }).parts;

    return parseJsonPartArray(partsVal);
  }

  throw new Error('JSON 根节点应为零件数组，或形如 { "parts": [ ... ] } 的对象。');
}

export function detectInventoryFormat(filename: string, content: string): "json" | "csv" {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".json")) {
    return "json";
  }

  if (lower.endsWith(".csv")) {
    return "csv";
  }

  const t = stripBom(content).trim();

  if (t.startsWith("{") || t.startsWith("[")) {
    return "json";
  }

  return "csv";
}

export function parseMocInventoryContent(
  content: string,
  format: "json" | "csv",
): MocInventoryRow[] {
  return format === "json" ? parseMocInventoryJson(content) : parseMocInventoryCsv(content);
}
