import "server-only";

import { and, asc, count, countDistinct, eq, inArray, isNotNull, min, ne, sum } from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildOwnedParts,
  colors,
  elements,
  inventoryParts,
  partRelationships,
  parts,
} from "@/db/schema";

export type OwnedPartCardRow = {
  partNum: string;
  colorId: number;
  colorName: string;
  quantity: number;
};

const MAX_GRID_ROWS = 500;

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

/** 散装拥有方格列表：每行对应 (零件号, 颜色) */
export async function loadOwnedPartCards(): Promise<{
  rows: OwnedPartCardRow[];
  truncated: boolean;
  totalQty: number;
  uniqueParts: number;
}> {
  const userDb = getUserDb();
  const ownedRows = await userDb
    .select({
      partNum: buildOwnedParts.partNum,
      colorId: buildOwnedParts.colorId,
      quantity: buildOwnedParts.quantity,
    })
    .from(buildOwnedParts)
    .orderBy(asc(buildOwnedParts.partNum), asc(buildOwnedParts.colorId));

  if (ownedRows.length === 0) {
    return { rows: [], truncated: false, totalQty: 0, uniqueParts: 0 };
  }

  const colorIds = [...new Set(ownedRows.map((r) => r.colorId))];
  const catalogDb = getCatalogDb();
  const colorRows = await catalogDb
    .select({ id: colors.id, name: colors.name })
    .from(colors)
    .where(inArray(colors.id, colorIds));
  const colorNameById = new Map<number, string>();
  for (const c of colorRows) colorNameById.set(c.id, (c.name ?? "").trim());

  const rows: OwnedPartCardRow[] = ownedRows.map((r) => ({
    partNum: r.partNum,
    colorId: r.colorId,
    colorName: colorNameById.get(r.colorId) || "未知颜色",
    quantity: r.quantity,
  }));

  const totalQty = rows.reduce((a, r) => a + r.quantity, 0);
  const uniqueParts = new Set(rows.map((r) => r.partNum)).size;
  const truncated = rows.length > MAX_GRID_ROWS;
  return {
    rows: rows.slice(0, MAX_GRID_ROWS),
    truncated,
    totalQty,
    uniqueParts,
  };
}

export async function loadOwnedPartCatalogMeta(
  partNums: readonly string[],
  partColorKeys?: readonly { partNum: string; colorId: number }[]
) {
  if (partNums.length === 0) {
    return {
      nameByNum: new Map<string, string>(),
      thumbByNum: new Map<string, string>(),
      thumbByPartColor: new Map<string, string>(),
      elemCountByPart: new Map<string, number>(),
      colorCountByPart: new Map<string, number>(),
      printedPartNums: new Set<string>(),
    };
  }

  const catalogDb = getCatalogDb();
  const thumbByPartColor = new Map<string, string>();
  const thumbByPartColorPromise =
    partColorKeys && partColorKeys.length > 0
      ? (async () => {
          const partNumsForThumb = [...new Set(partColorKeys.map((k) => k.partNum))];
          const colorIdsForThumb = [...new Set(partColorKeys.map((k) => k.colorId))];
          const thumbRows = await catalogDb
            .select({
              partNum: inventoryParts.partNum,
              colorId: inventoryParts.colorId,
              thumb: min(inventoryParts.imgUrl),
            })
            .from(inventoryParts)
            .where(
              and(
                inArray(inventoryParts.partNum, partNumsForThumb),
                inArray(inventoryParts.colorId, colorIdsForThumb),
                isNotNull(inventoryParts.imgUrl),
                ne(inventoryParts.imgUrl, "")
              )
            )
            .groupBy(inventoryParts.partNum, inventoryParts.colorId);
          for (const r of thumbRows) {
            if (r.thumb && usableImgUrl(r.thumb)) {
              thumbByPartColor.set(`${r.partNum}\0${r.colorId}`, r.thumb.trim());
            }
          }
        })()
      : Promise.resolve();

  const [nameRows, thumbRows, elemRows, catalogColorRows, printedRows] = await Promise.all([
    catalogDb
      .select({ partNum: parts.partNum, name: parts.name })
      .from(parts)
      .where(inArray(parts.partNum, [...partNums])),
    catalogDb
      .select({ partNum: inventoryParts.partNum, thumb: min(inventoryParts.imgUrl) })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, [...partNums]),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum),
    catalogDb
      .select({
        partNum: elements.partNum,
        n: count(elements.elementId),
      })
      .from(elements)
      .where(inArray(elements.partNum, [...partNums]))
      .groupBy(elements.partNum),
    catalogDb
      .select({
        partNum: elements.partNum,
        n: countDistinct(elements.colorId),
      })
      .from(elements)
      .where(inArray(elements.partNum, [...partNums]))
      .groupBy(elements.partNum),
    catalogDb
      .select({ partNum: partRelationships.childPartNum })
      .from(partRelationships)
      .where(
        and(
          eq(partRelationships.relType, "P"),
          inArray(partRelationships.childPartNum, [...partNums])
        )
      )
      .groupBy(partRelationships.childPartNum),
    thumbByPartColorPromise,
  ]);

  const nameByNum = new Map<string, string>();
  for (const r of nameRows) nameByNum.set(r.partNum, (r.name ?? "").trim());

  const thumbByNum = new Map<string, string>();
  for (const r of thumbRows) {
    if (r.thumb && usableImgUrl(r.thumb)) thumbByNum.set(r.partNum, r.thumb.trim());
  }

  const elemCountByPart = new Map<string, number>();
  for (const r of elemRows) elemCountByPart.set(r.partNum, Number(r.n));

  const colorCountByPart = new Map<string, number>();
  for (const r of catalogColorRows) colorCountByPart.set(r.partNum, Number(r.n));

  const printedPartNums = new Set<string>();
  for (const r of printedRows) printedPartNums.add(r.partNum);

  return {
    nameByNum,
    thumbByNum,
    thumbByPartColor,
    elemCountByPart,
    colorCountByPart,
    printedPartNums,
  };
}

/** 某零件在散装拥有表中的合计数量（按颜色汇总） */
export async function loadOwnedQtyForPart(partNum: string): Promise<number> {
  const userDb = getUserDb();
  const [row] = await userDb
    .select({ total: sum(buildOwnedParts.quantity).mapWith(Number) })
    .from(buildOwnedParts)
    .where(eq(buildOwnedParts.partNum, partNum));
  return row?.total ?? 0;
}
