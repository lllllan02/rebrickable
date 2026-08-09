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
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";
import type { OwnedCategoryFilter } from "@/lib/owned-parts-category";

export const FAVORITE_PARTS_PAGE_SIZE = 40;

export type FavoritePartCardRow = {
  partNum: string;
  name: string;
  markedAt: string;
  thumbUrl: string | null;
  isPrinted: boolean;
};

export type FavoriteCategorySummaryRow = {
  id: number;
  name: string;
  count: number;
};

type FavRow = { partNum: string; markedAt: string };

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

async function loadAllFavoriteRows(): Promise<FavRow[]> {
  const userDb = getUserDb();
  return userDb
    .select({
      partNum: buildFavoriteParts.partNum,
      markedAt: buildFavoriteParts.markedAt,
    })
    .from(buildFavoriteParts)
    .orderBy(desc(buildFavoriteParts.markedAt), asc(buildFavoriteParts.partNum));
}

async function loadCatByPartNum(
  partNums: readonly string[]
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (partNums.length === 0) return map;
  const catalogDb = getCatalogDb();
  const rows = await catalogDb
    .select({ partNum: parts.partNum, partCatId: parts.partCatId })
    .from(parts)
    .where(inArray(parts.partNum, [...partNums]));
  for (const r of rows) map.set(r.partNum, r.partCatId ?? null);
  return map;
}

function filterFavRowsByCat(
  favRows: FavRow[],
  catByPart: Map<string, number | null>,
  catFilter: OwnedCategoryFilter
): FavRow[] {
  if (catFilter === "all") return favRows;
  if (catFilter === "uncategorized") {
    return favRows.filter((r) => {
      const catId = catByPart.get(r.partNum);
      return catId == null;
    });
  }
  return favRows.filter((r) => catByPart.get(r.partNum) === catFilter);
}

export async function loadFavoriteCategorySummary(): Promise<{
  total: number;
  categories: FavoriteCategorySummaryRow[];
  uncategorizedCount: number;
}> {
  const favRows = await loadAllFavoriteRows();
  const total = favRows.length;
  if (total === 0) {
    return { total: 0, categories: [], uncategorizedCount: 0 };
  }

  const partNums = favRows.map((r) => r.partNum);
  const catByPart = await loadCatByPartNum(partNums);

  const countByCatId = new Map<number, number>();
  let uncategorizedCount = 0;
  for (const r of favRows) {
    const catId = catByPart.get(r.partNum);
    if (catId == null) {
      uncategorizedCount += 1;
      continue;
    }
    countByCatId.set(catId, (countByCatId.get(catId) ?? 0) + 1);
  }

  const catIds = [...countByCatId.keys()];
  if (catIds.length === 0) {
    return { total, categories: [], uncategorizedCount };
  }

  const catalogDb = getCatalogDb();
  const nameRows = await catalogDb
    .select({ id: partCategories.id, name: partCategories.name })
    .from(partCategories)
    .where(inArray(partCategories.id, catIds));
  const nameById = new Map(nameRows.map((r) => [r.id, r.name]));

  const categories = catIds
    .map((id) => ({
      id,
      name: (nameById.get(id) ?? `类型 ${id}`).trim() || `类型 ${id}`,
      count: countByCatId.get(id) ?? 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  return { total, categories, uncategorizedCount };
}

export async function loadFavoriteCategoryLabel(
  filter: OwnedCategoryFilter
): Promise<string | null> {
  if (filter === "all") return null;
  if (filter === "uncategorized") return "未分类";
  const catalogDb = getCatalogDb();
  const [row] = await catalogDb
    .select({ name: partCategories.name })
    .from(partCategories)
    .where(eq(partCategories.id, filter))
    .limit(1);
  return (row?.name ?? "").trim() || `类型 ${filter}`;
}

export async function loadFavoritePartsPage(
  page: number,
  pageSize = FAVORITE_PARTS_PAGE_SIZE,
  catFilter: OwnedCategoryFilter = "all"
): Promise<{ total: number; page: number; rows: FavoritePartCardRow[] }> {
  const catalogDb = getCatalogDb();
  const allFavRows = await loadAllFavoriteRows();

  if (allFavRows.length === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const catByPart =
    catFilter === "all"
      ? new Map<string, number | null>()
      : await loadCatByPartNum(allFavRows.map((r) => r.partNum));

  const filtered = filterFavRowsByCat(allFavRows, catByPart, catFilter);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(totalPages, Math.max(1, page));
  const offset = (safePage - 1) * pageSize;

  if (total === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const favRows = filtered.slice(offset, offset + pageSize);
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
