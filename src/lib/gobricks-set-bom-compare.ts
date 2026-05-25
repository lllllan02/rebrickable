import {
  aggregateBomForGobricks,
  fulfillmentSerializeRowsFromGobricksPayload,
  shortageSerializeRowsFromGobricksPayload,
  type GobricksSheetSerializedRow,
} from "@/lib/gobricks-lego2-item-list";

const PART_MISS_REST = "零件未匹配";

export type GobricksSetBomCompareStats = {
  /** 计入价格的零件总价（元）；不含零件未匹配行 */
  totalPriceCny: number;
  /** 零件匹配占比（0–100），按 BOM 颗数：未出现在 missList 的颗数 / 总颗数 */
  matchPercent: number | null;
  /** BOM 总颗数 */
  bomPieceQty: number;
  /** 零件未匹配颗数（missList） */
  partMissPieceQty: number;
};

function isPartMissRest(rest: string): boolean {
  const parts = rest.split("·").map((s) => s.trim());
  return parts.some((p) => p === PART_MISS_REST);
}

function sumGobricksSerializedRowsCny(rows: readonly GobricksSheetSerializedRow[]): number {
  let s = 0;
  for (const r of rows) {
    const raw = ((r.gdsUnitPrice ?? r.gobricksUnitPrice) ?? "").trim().replace(/,/g, "");
    const u = Number(raw);
    if (!Number.isFinite(u) || u < 0) continue;
    const q = Number.isFinite(r.quantity) ? r.quantity : 0;
    if (!Number.isFinite(q) || q <= 0) continue;
    s += u * q;
  }
  return Math.round(s * 1e4) / 1e4;
}

/**
 * 好价榜高砖比价：总价含颜色未匹配等行，仅忽略「零件未匹配」；匹配率为 BOM 颗数维度。
 */
export function computeGobricksSetBomCompareStats(
  bom: readonly { partNum: string; colorId: number; quantity: number }[],
  payload: unknown
): GobricksSetBomCompareStats {
  const aggregated = aggregateBomForGobricks(bom);
  const bomPieceQty = aggregated.reduce((s, r) => s + r.quantity, 0);

  const fulfillment = fulfillmentSerializeRowsFromGobricksPayload(payload);
  const shortage = shortageSerializeRowsFromGobricksPayload(payload);

  const partMissRows = shortage.rows.filter((r) => isPartMissRest(r.rest));
  const pricedShortageRows = shortage.rows.filter((r) => !isPartMissRest(r.rest));

  const totalPriceCny = sumGobricksSerializedRowsCny([
    ...fulfillment.rows,
    ...pricedShortageRows,
  ]);

  const partMissPieceQty = partMissRows.reduce((s, r) => {
    const q = Number.isFinite(r.quantity) ? r.quantity : 0;
    return s + (q > 0 ? q : 0);
  }, 0);

  const matchedQty = Math.max(0, bomPieceQty - partMissPieceQty);
  const matchPercent =
    bomPieceQty > 0
      ? Math.round((matchedQty / bomPieceQty) * 1000) / 10
      : null;

  return {
    totalPriceCny,
    matchPercent,
    bomPieceQty,
    partMissPieceQty,
  };
}
