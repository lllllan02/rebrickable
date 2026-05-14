import { asc, desc, eq } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { inventories, inventoryParts, parts, colors, partCategories } from "@/db/schema";

/** 供高砖对照：最新版本官方清单的 part + color + qty */
export async function loadSetOfficialInventoryBomLines(
  setNumRaw: string
): Promise<{ partNum: string; colorId: number; quantity: number }[]> {
  const setNum = setNumRaw.trim();
  if (!setNum) return [];

  const db = getCatalogDb();
  const [inv] = await db
    .select({ id: inventories.id })
    .from(inventories)
    .where(eq(inventories.setNum, setNum))
    .orderBy(desc(inventories.version), desc(inventories.id))
    .limit(1);

  if (!inv) return [];

  const lines = await db
    .select({
      partNum: inventoryParts.partNum,
      colorId: inventoryParts.colorId,
      quantity: inventoryParts.quantity,
    })
    .from(inventoryParts)
    .innerJoin(parts, eq(inventoryParts.partNum, parts.partNum))
    .innerJoin(colors, eq(inventoryParts.colorId, colors.id))
    .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
    .where(eq(inventoryParts.inventoryId, inv.id))
    .orderBy(asc(inventoryParts.partNum), asc(inventoryParts.colorId));

  return lines.map((l) => ({
    partNum: l.partNum,
    colorId: l.colorId,
    quantity: l.quantity,
  }));
}
