/**
 * 本站导出 / 缺件表 CSV：`Part,Color[,ElementId],Quantity,高砖单价,备注`。
 */

import { parse } from "csv-parse/sync";

import type { ParseShortageCsvResult, ShortageCsvRow } from "@/lib/parse-shortage-csv";
import { splitShortagePriceAndRest } from "@/lib/parse-shortage-csv";

function firstNonEmptyLine(text: string): string | null {
  const raw = text.replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() !== "") return line.trimEnd();
  }
  return null;
}

function headerCells(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

export function looksLikeAppPartsSheetExport(text: string): boolean {
  const line = firstNonEmptyLine(text);
  if (!line) return false;
  const names = new Set(headerCells(line).map((c) => c.toLowerCase()));
  if (!names.has("part") || !names.has("color") || !names.has("quantity")) return false;
  if (names.has("blitemno")) return false;
  if (names.has("is spare")) return false;
  return names.has("elementid") || [...names].some((n) => n.includes("高砖") || n === "备注");
}

function pickCI(row: Record<string, unknown>, key: string): string {
  const want = key.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === want) return v == null ? "" : String(v).trim();
  }
  return "";
}

function parseColorField(raw: string): number | null {
  const t = raw.replace(/^[\u0027\u2018\u2019\u0022\u201c\u201d]+/, "").trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseAppPartsSheetCsv(text: string): ParseShortageCsvResult {
  const raw = text.replace(/^\uFEFF/, "");
  let records: Record<string, string>[];
  try {
    records = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `零件表 CSV 解析失败：${msg}` };
  }

  const rows: ShortageCsvRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const partNum = pickCI(record, "Part").trim();
    const colorStr = pickCI(record, "Color");
    const elementIdRaw = pickCI(record, "ElementId") || pickCI(record, "Element ID");
    const qtyStr = pickCI(record, "Quantity").trim();
    const lineNumber = i + 2;

    if (partNum === "" || partNum.toLowerCase() === "part") continue;

    const colorId = parseColorField(colorStr);
    if (colorId == null) {
      return { ok: false, error: "Color 无效（须为非负整数，可带前导引号）。", lineNumber };
    }

    const quantity = Number.parseInt(qtyStr, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, error: "Quantity 无效（须为正整数）。", lineNumber };
    }

    const priceRaw = pickCI(record, "高砖单价");
    const noteRaw = pickCI(record, "备注");
    const tailAfterQty = [priceRaw, noteRaw].filter(Boolean).join(",");
    const { gobricksUnitPrice, rest } = splitShortagePriceAndRest(tailAfterQty);

    rows.push({
      lineNumber,
      partNum,
      colorId,
      elementId: elementIdRaw.length > 0 ? elementIdRaw : null,
      quantity,
      gobricksUnitPrice,
      rest,
    });
  }

  return { ok: true, rows, skippedHeader: true };
}
