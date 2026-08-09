import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  min,
  ne,
} from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildFavoriteParts,
  inventoryParts,
  partRelationships,
  parts,
} from "@/db/schema";

export const FAVORITE_PARTS_PAGE_SIZE = 40;

export type FavoritePartCardRow = {
  partNum: string;
  name: string;
  markedAt: string;
  thumbUrl: string | null;
  isPrinted: boolean;
};

export async function isPartFavorite(partNum: string): Promise<boolean> {
  const trimmed = partNum.trim();
  if (!trimmed) return false;
  const userDb = getUserDb();
  const [row] = await userDb
    .select({ partNum: buildFavoriteParts.partNum })
    .from(buildFavoriteParts)
    .where(eq(buildFavoriteParts.partNum, trimmed))
    .limit(1);
  return Boolean(row);
}

/** 返回传入零件号中已收藏的集合 */
export async function loadFavoritePartNums(
  partNums: readonly string[]
): Promise<Set<string>> {
  const unique = [...new Set(partNums.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();
  const userDb = getUserDb();
  const rows = await userDb
    .select({ partNum: buildFavoriteParts.partNum })
    .from(buildFavoriteParts)
    .where(inArray(buildFavoriteParts.partNum, unique));
  return new Set(rows.map((r) => r.partNum));
}

export async function countFavoriteParts(): Promise<number> {
  const userDb = getUserDb();
  const [row] = await userDb.select({ c: count() }).from(buildFavoriteParts);
  return Number(row?.c ?? 0);
}

export async function loadFavoritePartsPage(
  page: number,
  pageSize = FAVORITE_PARTS_PAGE_SIZE
): Promise<{ total: number; page: number; rows: FavoritePartCardRow[] }> {
  const userDb = getUserDb();
  const catalogDb = getCatalogDb();

  const [totalRow] = await userDb.select({ c: count() }).from(buildFavoriteParts);
  const total = Number(totalRow?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(totalPages, Math.max(1, page));
  const offset = (safePage - 1) * pageSize;

  if (total === 0) {
    return { total, page: 1, rows: [] };
  }

  const favRows = await userDb
    .select({
      partNum: buildFavoriteParts.partNum,
      markedAt: buildFavoriteParts.markedAt,
    })
    .from(buildFavoriteParts)
    .orderBy(desc(buildFavoriteParts.markedAt), asc(buildFavoriteParts.partNum))
    .limit(pageSize)
    .offset(offset);

  if (favRows.length === 0) {
    return { total, page: safePage, rows: [] };
  }

  const partNums = favRows.map((r) => r.partNum);

  const [nameRows, thumbRows, printedRows] = await Promise.all([
    catalogDb
      .select({ partNum: parts.partNum, name: parts.name })
      .from(parts)
      .where(inArray(parts.partNum, partNums)),
    catalogDb
      .select({
        partNum: inventoryParts.partNum,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, partNums),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum),
    catalogDb
      .select({ partNum: partRelationships.childPartNum })
      .from(partRelationships)
      .where(
        and(
          inArray(partRelationships.childPartNum, partNums),
          eq(partRelationships.relType, "P")
        )
      ),
  ]);

  const nameByPart = new Map(nameRows.map((r) => [r.partNum, r.name]));
  const thumbByPart = new Map<string, string | null>();
  for (const t of thumbRows) {
    if (t.thumb?.trim()) thumbByPart.set(t.partNum, t.thumb.trim());
  }
  const printedPartNums = new Set(printedRows.map((r) => r.partNum));

  return {
    total,
    page: safePage,
    rows: favRows.map((r) => ({
      partNum: r.partNum,
      name: nameByPart.get(r.partNum) ?? r.partNum,
      markedAt: r.markedAt,
      thumbUrl: thumbByPart.get(r.partNum) ?? null,
      isPrinted: printedPartNums.has(r.partNum),
    })),
  };
}

/** 校验零件号是否存在于目录（供 action 使用） */
export async function catalogPartExists(partNum: string): Promise<boolean> {
  const trimmed = partNum.trim();
  if (!trimmed) return false;
  const catalogDb = getCatalogDb();
  const [row] = await catalogDb
    .select({ partNum: parts.partNum })
    .from(parts)
    .where(eq(parts.partNum, trimmed))
    .limit(1);
  return Boolean(row);
}
