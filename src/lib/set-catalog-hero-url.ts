import { and, eq, inArray, isNotNull, max, min, ne } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { inventories, inventoryMinifigs, legoSets, minifigs } from "@/db/schema";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

/**
 * 批量解析套装「首张图」URL（与详情页轮播首张一致）：仅官方盒图（sets）→ 人仔封面：
 * minifigs 中 fig_num 与 set_num 相同；若无则取最新清单上 inventory_minifigs 的人仔图。不使用零件图。
 */
export async function batchSetCatalogHeroUrls(setNums: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const s of setNums) out.set(s, null);
  if (setNums.length === 0) return out;

  const db = getCatalogDb();
  const cat = await db
    .select({ setNum: legoSets.setNum, imgUrl: legoSets.imgUrl })
    .from(legoSets)
    .where(inArray(legoSets.setNum, setNums));

  for (const c of cat) {
    if (usableImgUrl(c.imgUrl)) {
      out.set(c.setNum, c.imgUrl!.trim());
    }
  }

  const needFigCatalog = setNums.filter((s) => !usableImgUrl(out.get(s)));
  if (needFigCatalog.length > 0) {
    const figRows = await db
      .select({ figNum: minifigs.figNum, imgUrl: minifigs.imgUrl })
      .from(minifigs)
      .where(
        and(
          inArray(minifigs.figNum, needFigCatalog),
          isNotNull(minifigs.imgUrl),
          ne(minifigs.imgUrl, "")
        )
      );
    for (const fr of figRows) {
      if (usableImgUrl(fr.figNum) && usableImgUrl(fr.imgUrl) && !usableImgUrl(out.get(fr.figNum))) {
        out.set(fr.figNum.trim(), fr.imgUrl!.trim());
      }
    }
  }

  const needInv = new Set(setNums.filter((s) => !usableImgUrl(out.get(s))));
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

  const thumbByInv = new Map<number, string | null>();
  const miniRows = await db
    .select({
      inventoryId: inventoryMinifigs.inventoryId,
      thumb: min(minifigs.imgUrl),
    })
    .from(inventoryMinifigs)
    .innerJoin(minifigs, eq(inventoryMinifigs.figNum, minifigs.figNum))
    .where(
      and(
        inArray(inventoryMinifigs.inventoryId, invIds),
        isNotNull(minifigs.imgUrl),
        ne(minifigs.imgUrl, "")
      )
    )
    .groupBy(inventoryMinifigs.inventoryId);
  for (const t of miniRows) {
    if (usableImgUrl(t.thumb)) thumbByInv.set(t.inventoryId, t.thumb!.trim());
  }

  for (const row of invRows) {
    if (usableImgUrl(out.get(row.setNum) ?? undefined)) continue;
    const thumb = thumbByInv.get(row.id);
    if (usableImgUrl(thumb)) out.set(row.setNum, thumb!);
  }

  return out;
}
