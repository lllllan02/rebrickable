/**
 * Rebrickable MOC / 套装「零件清单」导出 CSV：`Part,Color,Quantity[,Is Spare]`。
 */

import { parse } from "csv-parse/sync";

import type { ParseShortageCsvResult, ShortageCsvRow } from "@/lib/parse-shortage-csv";

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

export function looksLikeRebrickablePartsExport(text: string): boolean {
  const line = firstNonEmptyLine(text);
  if (!line) return false;
  const names = new Set(headerCells(line).map((c) => c.toLowerCase()));
  return (
    names.has("part") &&
    names.has("color") &&
    names.has("quantity") &&
    !names.has("blitemno") &&
    !names.has("elementid")
  );
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

function isSpareRow(record: Record<string, unknown>): boolean {
  const v = pickCI(record, "Is Spare").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function parseRebrickablePartsCsv(text: string): ParseShortageCsvResult {
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
    return { ok: false, error: `Rebrickable 零件表 CSV 解析失败：${msg}` };
  }

  const rows: ShortageCsvRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const partNum = pickCI(record, "Part").trim();
    const colorStr = pickCI(record, "Color");
    const elementIdRaw = pickCI(record, "ElementId") || pickCI(record, "Element ID");
    const qtyStr = pickCI(record, "Quantity").trim();
    const lineNumber = i + 2;

    if (partNum === "") continue;
    if (isSpareRow(record)) continue;

    const colorId = parseColorField(colorStr);
    if (colorId == null) {
      return { ok: false, error: "Color 无效（须为非负整数，可带前导引号）。", lineNumber };
    }

    const quantity = Number.parseInt(qtyStr, 10);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, error: "Quantity 无效（须为正整数）。", lineNumber };
    }

    const elementId = elementIdRaw.length > 0 ? elementIdRaw : null;

    rows.push({
      lineNumber,
      partNum,
      colorId,
      elementId,
      quantity,
      gobricksUnitPrice: null,
      rest: pickCI(record, "Is Spare") ? `Is Spare: ${pickCI(record, "Is Spare")}` : "",
    });
  }

  return { ok: true, rows, skippedHeader: true };
}
