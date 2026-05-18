import { looksLikeAppPartsSheetExport, parseAppPartsSheetCsv } from "@/lib/parse-app-parts-sheet-csv";
import { looksLikeBrickLinkStudioPartsExport, parseBrickLinkStudioPartsCsv } from "@/lib/parse-bricklink-studio-csv";
import type { ParseShortageCsvResult } from "@/lib/parse-shortage-csv";
import { parseShortageCsv } from "@/lib/parse-shortage-csv";
import { looksLikeRebrickablePartsExport, parseRebrickablePartsCsv } from "@/lib/parse-rebrickable-parts-csv";

/** 统一入口：BrickLink Studio / Rebrickable 零件表 / 本站缺件表 CSV */
export function parsePartsSheetCsv(text: string): ParseShortageCsvResult {
  if (looksLikeBrickLinkStudioPartsExport(text)) {
    return parseBrickLinkStudioPartsCsv(text);
  }
  if (looksLikeRebrickablePartsExport(text)) {
    return parseRebrickablePartsCsv(text);
  }
  if (looksLikeAppPartsSheetExport(text)) {
    return parseAppPartsSheetCsv(text);
  }
  return parseShortageCsv(text);
}
