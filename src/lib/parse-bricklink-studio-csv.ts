/**
 * LEGO BrickLink Studio 2.0「零件清单」导出 CSV（表头含 BLItemNo / BLColorId / LDrawColorId / Qty 等列）。
 * 使用 RFC 4180 风格引号字段解析，以兼容 PartName 等列中的英文逗号。
 *
 * 颜色列：优先使用 **LDrawColorId**（与 Rebrickable `colors.id`、高砖 `lego2ItemList` 的 `ldr` 色值一致）。
 * **BLColorId** 为 BrickLink 自有编号，与本站目录不同，误用会导致列表色名错误、同步高砖严重跑偏。
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

/** 表头行无引号内逗号，按逗号切分即可识别列名 */
function headerCells(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
}

export function looksLikeBrickLinkStudioPartsExport(text: string): boolean {
  const line = firstNonEmptyLine(text);
  if (!line) return false;
  const names = new Set(headerCells(line).map((c) => c.toLowerCase()));
  return names.has("blitemno") && names.has("qty") && names.has("ldrawcolorid");
}

function pickCI(row: Record<string, unknown>, key: string): string {
  const want = key.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === want) return v == null ? "" : String(v).trim();
  }
  return "";
}

export function parseBrickLinkStudioPartsCsv(text: string): ParseShortageCsvResult {
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
    return { ok: false, error: `BrickLink Studio CSV 解析失败：${msg}` };
  }

  const rows: ShortageCsvRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    const partNum = pickCI(record, "BLItemNo").trim();
    const ldrawColorStr = pickCI(record, "LDrawColorId").trim();
    const blColorStr = pickCI(record, "BLColorId").trim();
    const qtyStr = pickCI(record, "Qty").trim();
    const lineNumber = i + 2;

    if (partNum === "") {
      continue;
    }

    if (/^total\b/i.test(partNum)) {
      continue;
    }

    if (ldrawColorStr === "" && qtyStr === "") {
      continue;
    }

    if (ldrawColorStr === "") {
      return {
        ok: false,
        error:
          "缺少 LDrawColorId：本站与高砖按乐高/LDraw 色值对齐，不能改用 BrickLink 的 BLColorId。请使用 Studio 默认「零件清单」导出（含 LDrawColorId 列）。",
        lineNumber,
      };
    }

    const colorId = Number.parseInt(ldrawColorStr, 10);
    const quantity = Number.parseInt(qtyStr, 10);

    if (!Number.isFinite(colorId) || colorId < 0) {
      return { ok: false, error: "LDrawColorId 无效（须为非负整数）。", lineNumber };
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, error: "Qty 无效（须为正整数）。", lineNumber };
    }

    const partName = pickCI(record, "PartName");
    const weight = pickCI(record, "Weight");
    const restBits: string[] = [];
    if (partName) restBits.push(partName);
    if (weight) restBits.push(`重量 ${weight}`);
    if (blColorStr) restBits.push(`BrickLink 色号 ${blColorStr}`);

    rows.push({
      lineNumber,
      partNum,
      colorId,
      quantity,
      gobricksUnitPrice: null,
      rest: restBits.join(" · "),
    });
  }

  return { ok: true, rows, skippedHeader: true };
}
