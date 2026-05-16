import {
  parseBrickLinkColorIdFromSheetRest,
  rebrickableColorIdToBrickLinkColorId,
} from "@/lib/rebrickable-bricklink-color";
import type { BrickLinkInventoryXmlRow } from "@/lib/serialize-bricklink-inventory-xml";

/** 零件表行：列表展示 Rebrickable 色 ID，XML 导出 BrickLink 色 ID */
export type PartsSheetLegoColorSource = {
  /** Rebrickable `colors.id`，与详情/方格「色 ID」一致 */
  colorId: number;
  rest?: string;
};

/** 列表展示的乐高/Rebrickable 色 ID */
export function displayColorIdForPartsSheetExport(row: PartsSheetLegoColorSource): number {
  const c = Math.trunc(Number(row.colorId));
  return Number.isFinite(c) && c >= 0 ? c : 0;
}

/**
 * BrickLink 心愿单 XML 的 COLOR：BrickLink 色号。
 * 由列表中的 Rebrickable 色 ID 查映射表（如绿 2→6）；无映射时回退为原 id。
 */
export function brickLinkColorIdForXmlExport(row: PartsSheetLegoColorSource): number {
  const fromRest = parseBrickLinkColorIdFromSheetRest(row.rest);
  if (fromRest != null) return fromRest;

  const rb = displayColorIdForPartsSheetExport(row);
  const bl = rebrickableColorIdToBrickLinkColorId(rb);
  if (bl != null) return bl;

  return rb;
}

export function partsSheetRowToBrickLinkInventoryXmlRow(
  row: PartsSheetLegoColorSource & { partNum: string; quantity: number }
): BrickLinkInventoryXmlRow {
  return {
    partNum: row.partNum,
    colorId: brickLinkColorIdForXmlExport(row),
    quantity: row.quantity,
  };
}
