import { asc, desc, eq } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { colors, inventories, inventoryParts, partCategories, parts } from "@/db/schema";
import {
  officialInventoryRowsToShortageResolveItems,
  type OfficialInventoryDbRow,
} from "@/lib/official-inventory-to-resolve-items";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 套装最新版官方库存 → 完整零件表行（与套装详情页一致） */
export async function loadSetOfficialInventoryResolveItems(
  setNumRaw: string
): Promise<ShortageResolveItem[]> {
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
      name: parts.name,
      colorId: inventoryParts.colorId,
      colorName: colors.name,
      quantity: inventoryParts.quantity,
      isSpare: inventoryParts.isSpare,
      imgUrl: inventoryParts.imgUrl,
      partCatName: partCategories.name,
    })
    .from(inventoryParts)
    .innerJoin(parts, eq(inventoryParts.partNum, parts.partNum))
    .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
    .innerJoin(colors, eq(inventoryParts.colorId, colors.id))
    .where(eq(inventoryParts.inventoryId, inv.id))
    .orderBy(asc(inventoryParts.partNum), asc(inventoryParts.colorId));

  const rows: OfficialInventoryDbRow[] = lines.map((l) => ({
    partNum: l.partNum,
    name: l.name,
    colorId: l.colorId,
    colorName: l.colorName,
    quantity: l.quantity,
    isSpare: l.isSpare,
    imgUrl: l.imgUrl,
    partCatName: l.partCatName ?? null,
  }));

  return officialInventoryRowsToShortageResolveItems(rows);
}
