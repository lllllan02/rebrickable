import { and, eq, inArray, isNotNull, max, min, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import { inventories, inventoryParts, legoSets } from "@/db/schema";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

/**
 * 批量解析套装「首张图」URL（与详情页轮播首张一致）：优先官方盒图，否则取该套装最新库存清单中的零件图之一。
 */
export async function batchSetCatalogHeroUrls(setNums: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const s of setNums) out.set(s, null);
  if (setNums.length === 0) return out;

  const db = getDb();
  const cat = await db
    .select({ setNum: legoSets.setNum, imgUrl: legoSets.imgUrl })
    .from(legoSets)
    .where(inArray(legoSets.setNum, setNums));

  const needInv = new Set<string>();
  for (const c of cat) {
    if (usableImgUrl(c.imgUrl)) {
      out.set(c.setNum, c.imgUrl!.trim());
    } else {
      needInv.add(c.setNum);
    }
  }
  for (const s of setNums) {
    if (!cat.some((c) => c.setNum === s)) needInv.add(s);
  }
  if (needInv.size === 0) return out;

  const invLatest = db
    .select({
      setNum: inventories.setNum,
      maxVersion: max(inventories.version).as("max_version"),
    })
    .from(inventories)
    .where(inArray(inventories.setNum, [...needInv]))
    .groupBy(inventories.setNum)
    .as("inv_latest");

  const invRows = await db
    .select({
      setNum: inventories.setNum,
      id: inventories.id,
    })
    .from(inventories)
    .innerJoin(
      invLatest,
      and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
    )
    .where(inArray(inventories.setNum, [...needInv]));

  const invIds = invRows.map((r) => r.id);
  if (invIds.length === 0) return out;

  const thumbRows = await db
    .select({
      inventoryId: inventoryParts.inventoryId,
      thumb: min(inventoryParts.imgUrl),
    })
    .from(inventoryParts)
    .where(
      and(
        inArray(inventoryParts.inventoryId, invIds),
        isNotNull(inventoryParts.imgUrl),
        ne(inventoryParts.imgUrl, "")
      )
    )
    .groupBy(inventoryParts.inventoryId);

  const thumbByInv = new Map<number, string | null>();
  for (const t of thumbRows) {
    if (usableImgUrl(t.thumb)) thumbByInv.set(t.inventoryId, t.thumb!.trim());
  }

  for (const row of invRows) {
    if (usableImgUrl(out.get(row.setNum) ?? undefined)) continue;
    const thumb = thumbByInv.get(row.id);
    if (usableImgUrl(thumb)) out.set(row.setNum, thumb!);
  }

  return out;
}
