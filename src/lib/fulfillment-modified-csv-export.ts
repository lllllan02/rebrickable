import {
  parseGdsColorSegmentFromGdsItemId,
  parseGobricksProductIdFromGdsItemId,
} from "@/lib/gobricks-item-filter-inventory";
import { restHasSheetRowReplacedMarker } from "@/lib/sheet-row-replaced-marker";
import { serializeShortageCsv, type ShortageCsvSerializeRow } from "@/lib/serialize-shortage-csv";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 配货表行是否经「更换零件」修改过 */
export function isFulfillmentSheetRowModified(rest: string): boolean {
  return restHasSheetRowReplacedMarker(rest);
}

/** 修改 CSV 的 Part 列：高砖 SKU，须以 `GDS-` 开头（优先完整 `GDS-{product}-{color}`） */
export function gobricksPartFieldForModifiedCsvExport(
  gdsItemId: string | null | undefined
): string | null {
  const s = gdsItemId?.trim();
  if (!s) return null;
  if (/^GDS-/i.test(s)) return s;
  const pid = parseGobricksProductIdFromGdsItemId(s);
  if (pid) return `GDS-${pid}`;
  if (/^\d+$/.test(s)) return `GDS-${s}`;
  return null;
}

/** 将已修改的配货表行转为 CSV 行（Part 为高砖 GDS 编号，Color 为高砖色 ID） */
export function fulfillmentModifiedRowToCsvSerialize(
  row: ShortageResolveItem
): ShortageCsvSerializeRow | null {
  const partNum = gobricksPartFieldForModifiedCsvExport(row.gdsItemId);
  if (!partNum) return null;

  const gdsColor =
    row.gdsColorId?.trim() || parseGdsColorSegmentFromGdsItemId(row.gdsItemId) || null;
  const colorField = gdsColor ? `'${gdsColor}` : `'${row.colorId}`;

  return {
    partNum,
    colorId: row.colorId,
    colorField,
    quantity: row.quantity,
    gobricksUnitPrice: row.gobricksUnitPrice,
    gdsUnitPrice: row.gdsUnitPrice ?? row.gobricksUnitPrice,
    rest: row.rest,
  };
}

export function fulfillmentModifiedRowsForCsvExport(
  items: readonly ShortageResolveItem[]
): ShortageCsvSerializeRow[] {
  const out: ShortageCsvSerializeRow[] = [];
  for (const r of items) {
    if (!isFulfillmentSheetRowModified(r.rest)) continue;
    const line = fulfillmentModifiedRowToCsvSerialize(r);
    if (line) out.push(line);
  }
  return out;
}

export function countFulfillmentModifiedExportable(
  items: readonly ShortageResolveItem[]
): { modified: number; exportable: number } {
  let modified = 0;
  let exportable = 0;
  for (const r of items) {
    if (!isFulfillmentSheetRowModified(r.rest)) continue;
    modified++;
    if (fulfillmentModifiedRowToCsvSerialize(r)) exportable++;
  }
  return { modified, exportable };
}

export function serializeFulfillmentModifiedCsv(items: readonly ShortageResolveItem[]): string {
  return serializeShortageCsv(fulfillmentModifiedRowsForCsvExport(items), { includeHeader: true });
}
