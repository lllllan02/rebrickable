/**
 * 解析 Rebrickable 导出风格的零件表（缺货表）CSV。
 * Color 列常见形态为 `'182`（前导单引号 + 数字）；部分导出会用全角逗号、分号或 Tab 作分隔。
 */

export type ShortageCsvRow = {
  /** 1-based，含表头则为表头行号 */
  lineNumber: number;
  partNum: string;
  colorId: number;
  /** LEGO element_id；Studio 导出或目录回填 */
  elementId: string | null;
  quantity: number;
  /** 高砖 `info.price` 等（元）；旧版 CSV 无此列时为 null */
  gobricksUnitPrice: string | null;
  /** 备注等；旧版为数量列后的全部尾部 */
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

const PRICE_TOKEN_RE = /^\d+(\.\d+)?$/;

/**
 * 解析「数量」列之后：可选单列高砖单价（纯数字/小数），再接备注。
 * 兼容旧版三列后整段为备注（无单价列）。
 */
export function splitShortagePriceAndRest(tailRaw: string): {
  gobricksUnitPrice: string | null;
  rest: string;
} {
  const tail = tailRaw.trimEnd();
  const t = tail.trim();
  if (t === "") return { gobricksUnitPrice: null, rest: "" };
  if (PRICE_TOKEN_RE.test(t)) {
    return { gobricksUnitPrice: t, rest: "" };
  }

  let sepIdx = -1;
  for (let i = 0; i < tail.length; i++) {
    if (COLUMN_SEPARATORS.has(tail[i]!)) {
      sepIdx = i;
      break;
    }
  }
  if (sepIdx < 0) {
    return { gobricksUnitPrice: null, rest: tail.trim() };
  }
  const first = tail.slice(0, sepIdx).trim();
  const after = tail.slice(sepIdx + 1);
  if (first === "") {
    return { gobricksUnitPrice: null, rest: after.trim() };
  }
  if (PRICE_TOKEN_RE.test(first)) {
    return { gobricksUnitPrice: first, rest: after.trim() };
  }
  return { gobricksUnitPrice: null, rest: tail.trim() };
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
          "无法解析该行：第一列为零件号，之后应为「颜色ID」「数量」及可选「高砖单价」与备注列；颜色多为数字（可带 ' 或弯引号）；各列之间请用英文逗号、全角逗号、分号或 Tab 分隔。示例：6064,'2,1,0.35,类型,… 或 6064,'2,1,类型,…",
        lineNumber,
      };
    }

    const partNum = partField;
    const colorStr = m[1]!;
    const qtyStr = m[2]!;
    const tailAfterQty = m[3] ?? "";
    const { gobricksUnitPrice, rest } = splitShortagePriceAndRest(tailAfterQty);
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
      elementId: null,
      quantity,
      gobricksUnitPrice,
      rest,
    });
  }

  return { ok: true, rows, skippedHeader };
}
