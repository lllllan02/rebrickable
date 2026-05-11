/**
 * 解析 Rebrickable 导出风格的缺件表 CSV。
 * Color 列常见形态为 `'182`（前导单引号 + 数字）；部分导出会用全角逗号、分号或 Tab 作分隔。
 */

export type ShortageCsvRow = {
  /** 1-based，含表头则为表头行号 */
  lineNumber: number;
  partNum: string;
  colorId: number;
  quantity: number;
  /** 第四列及之后的原始尾部（类型、渠道、说明等），便于展示 */
  rest: string;
};

export type ParseShortageCsvResult =
  | { ok: true; rows: ShortageCsvRow[]; skippedHeader: boolean }
  | { ok: false; error: string; lineNumber?: number };

/** 可作为「列」分隔的字符（零件号内不应出现） */
const COLUMN_SEPARATORS = new Set([
  ",",
  "\uFF0C", // ，FULLWIDTH COMMA
  ";",
  "\uFF1B", // ；FULLWIDTH SEMICOLON
  "\t",
]);

/**
 * 第一列（零件号）与其余部分：取行中第一个列分隔符。
 */
function splitLeadingPart(line: string): { part: string; afterPart: string } | null {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (COLUMN_SEPARATORS.has(ch)) {
      return {
        part: line.slice(0, i).trim(),
        afterPart: line.slice(i + 1),
      };
    }
  }
  return null;
}

/**
 * 颜色（可选引号）、数量、其余列。
 * 引号：ASCII '、" 与常见弯引号（Excel 等）。
 */
/** 字符类内避免使用未转义的 `'`/`"`，否则会截断正则字面量 */
const AFTER_PART_TAIL_RE =
  /^\s*[\u0027\u2018\u2019\u0022\u201c\u201d]?(\d+)\s*[,，;\t\uFF0C\uFF1B]\s*(\d+)\s*[,，;\t\uFF0C\uFF1B]\s*(.*)$/;

function isHeaderLine(partField: string): boolean {
  return partField.trim().toLowerCase() === "part";
}

export function parseShortageCsv(text: string): ParseShortageCsvResult {
  const rawLines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const rows: ShortageCsvRow[] = [];
  let skippedHeader = false;

  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    const line = rawLines[i]!.trimEnd();
    if (line.trim() === "") continue;

    const split = splitLeadingPart(line);
    if (!split) {
      return {
        ok: false,
        error: "该行未找到列分隔符（需为英文逗号、全角逗号、分号或 Tab）。",
        lineNumber,
      };
    }

    const partField = split.part;
    if (isHeaderLine(partField)) {
      skippedHeader = true;
      continue;
    }

    if (!partField) {
      return {
        ok: false,
        error: "第一列零件号为空。",
        lineNumber,
      };
    }

    const m = split.afterPart.match(AFTER_PART_TAIL_RE);
    if (!m) {
      return {
        ok: false,
        error:
          "无法解析该行：第一列为零件号，之后应为「颜色ID」「数量」及后续列；颜色多为数字（可带 ' 或弯引号）；各列之间请用英文逗号、全角逗号、分号或 Tab 分隔。示例：6064,'2,1,类型,…",
        lineNumber,
      };
    }

    const partNum = partField;
    const colorStr = m[1]!;
    const qtyStr = m[2]!;
    const rest = m[3] ?? "";
    const colorId = Number.parseInt(colorStr, 10);
    const quantity = Number.parseInt(qtyStr, 10);
    if (!Number.isFinite(colorId) || colorId < 0) {
      return {
        ok: false,
        error: "颜色 ID 无效。",
        lineNumber,
      };
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      return {
        ok: false,
        error: "数量无效（须为正整数）。",
        lineNumber,
      };
    }

    rows.push({
      lineNumber,
      partNum,
      colorId,
      quantity,
      rest,
    });
  }

  return { ok: true, rows, skippedHeader };
}
