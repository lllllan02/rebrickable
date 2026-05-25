import { and, desc, eq, inArray } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { inventories, inventoryParts, partCategories, parts } from "@/db/schema";
import {
  aggregateStudVolumeFromLines,
  type SetStudVolumeAggregate,
} from "@/lib/part-stud-volume";

export type { SetStudVolumeAggregate };

/** 无官方 BOM 时的占位 */
const EMPTY_STATS: SetStudVolumeAggregate = {
  totalPieceQty: 0,
  coveredPieceQty: 0,
  totalStudUnits: 0,
  coverageRatio: null,
};

async function resolveLatestInventoryIds(
  setNums: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (setNums.length === 0) return out;

  const db = getCatalogDb();
  const invRows = await db
    .select({
      setNum: inventories.setNum,
      id: inventories.id,
      version: inventories.version,
    })
    .from(inventories)
    .where(inArray(inventories.setNum, setNums))
    .orderBy(desc(inventories.version), desc(inventories.id));

  for (const row of invRows) {
    if (!out.has(row.setNum)) out.set(row.setNum, row.id);
  }
  return out;
}

/**
 * 批量计算套装官方 BOM 占地单位（最新 inventory，主件不含 spare）。
 */
export async function batchSetStudVolumeStats(
  setNums: string[]
): Promise<Map<string, SetStudVolumeAggregate>> {
  const result = new Map<string, SetStudVolumeAggregate>();
  for (const s of setNums) result.set(s, { ...EMPTY_STATS });

  if (setNums.length === 0) return result;

  const invBySet = await resolveLatestInventoryIds(setNums);
  const invIds = [...invBySet.values()];
  if (invIds.length === 0) return result;

  const db = getCatalogDb();
  const rows = await db
    .select({
      inventoryId: inventoryParts.inventoryId,
      quantity: inventoryParts.quantity,
      partName: parts.name,
      categoryName: partCategories.name,
    })
    .from(inventoryParts)
    .innerJoin(parts, eq(inventoryParts.partNum, parts.partNum))
    .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
    .where(
      and(inArray(inventoryParts.inventoryId, invIds), eq(inventoryParts.isSpare, false))
    );

  const invToSet = new Map<number, string>();
  for (const [setNum, invId] of invBySet) invToSet.set(invId, setNum);

  const linesBySet = new Map<string, { quantity: number; partName: string; categoryName: string | null }[]>();
  for (const row of rows) {
    const setNum = invToSet.get(row.inventoryId);
    if (!setNum) continue;
    let bucket = linesBySet.get(setNum);
    if (!bucket) {
      bucket = [];
      linesBySet.set(setNum, bucket);
    }
    bucket.push({
      quantity: row.quantity,
      partName: row.partName,
      categoryName: row.categoryName,
    });
  }

  for (const setNum of setNums) {
    const lines = linesBySet.get(setNum);
    if (!lines || lines.length === 0) continue;
    result.set(setNum, aggregateStudVolumeFromLines(lines));
  }

  return result;
}
