import "server-only";

import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  min,
  ne,
  sum,
} from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildOwnedParts,
  colors,
  elements,
  inventoryParts,
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";
import type { OwnedCategoryFilter } from "@/lib/owned-parts-category";

export type OwnedPartCardRow = {
  partNum: string;
  colorId: number;
  colorName: string;
  quantity: number;
};

export const OWNED_PARTS_BATCH_SIZE = 40;

export type OwnedPartsStats = {
  totalRows: number;
  totalQty: number;
  uniqueParts: number;
};

export type OwnedCategorySummaryRow = {
  id: number;
  name: string;
  count: number;
  hero: string | null;
};

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export async function loadOwnedPartsStats(): Promise<OwnedPartsStats> {
  const userDb = getUserDb();
  const [statsRow] = await userDb
    .select({
      totalRows: count(),
      uniqueParts: countDistinct(buildOwnedParts.partNum),
      totalQty: sum(buildOwnedParts.quantity).mapWith(Number),
    })
    .from(buildOwnedParts);

  return {
    totalRows: Number(statsRow?.totalRows ?? 0),
    totalQty: statsRow?.totalQty ?? 0,
    uniqueParts: Number(statsRow?.uniqueParts ?? 0),
  };
}

async function loadOwnedPartCatByNum(partNums: readonly string[]): Promise<Map<string, number | null>> {
  const catByPart = new Map<string, number | null>();
  if (partNums.length === 0) return catByPart;

  const catalogDb = getCatalogDb();
  const partCatRows = await catalogDb
    .select({ partNum: parts.partNum, partCatId: parts.partCatId })
    .from(parts)
    .where(inArray(parts.partNum, [...partNums]));

  for (const r of partCatRows) catByPart.set(r.partNum, r.partCatId ?? null);
  return catByPart;
}

async function resolveAllowedPartNums(filter: OwnedCategoryFilter): Promise<Set<string> | null> {
  if (filter === "all") return null;

  const userDb = getUserDb();
  const ownedPartRows = await userDb
    .select({ partNum: buildOwnedParts.partNum })
    .from(buildOwnedParts)
    .groupBy(buildOwnedParts.partNum);
  const ownedPartNums = ownedPartRows.map((r) => r.partNum);
  if (ownedPartNums.length === 0) return new Set();

  if (filter === "uncategorized") {
    const catByPart = await loadOwnedPartCatByNum(ownedPartNums);
    return new Set(
      ownedPartNums.filter((partNum) => {
        const catId = catByPart.get(partNum);
        return catId == null;
      })
    );
  }

  const catalogDb = getCatalogDb();
  const rows = await catalogDb
    .select({ partNum: parts.partNum })
    .from(parts)
    .where(eq(parts.partCatId, filter));
  const catalogPartNums = new Set(rows.map((r) => r.partNum));
  return new Set(ownedPartNums.filter((partNum) => catalogPartNums.has(partNum)));
}

async function attachColorNames(
  ownedRows: { partNum: string; colorId: number; quantity: number }[]
): Promise<OwnedPartCardRow[]> {
  if (ownedRows.length === 0) return [];

  const colorIds = [...new Set(ownedRows.map((r) => r.colorId))];
  const catalogDb = getCatalogDb();
  const colorRows = await catalogDb
    .select({ id: colors.id, name: colors.name })
    .from(colors)
    .where(inArray(colors.id, colorIds));
  const colorNameById = new Map<number, string>();
  for (const c of colorRows) colorNameById.set(c.id, (c.name ?? "").trim());

  return ownedRows.map((r) => ({
    partNum: r.partNum,
    colorId: r.colorId,
    colorName: colorNameById.get(r.colorId) || "未知颜色",
    quantity: r.quantity,
  }));
}

/** 零件库方格列表：每行对应 (零件号, 颜色)，可按分类筛选并分批读取 */
export async function loadOwnedPartCardsFiltered(
  filter: OwnedCategoryFilter,
  offset = 0,
  limit = OWNED_PARTS_BATCH_SIZE
): Promise<{
  rows: OwnedPartCardRow[];
  totalRows: number;
  hasMore: boolean;
}> {
  const userDb = getUserDb();
  const allowedPartNums = await resolveAllowedPartNums(filter);

  if (allowedPartNums !== null && allowedPartNums.size === 0) {
    return { rows: [], totalRows: 0, hasMore: false };
  }

  const whereClause =
    allowedPartNums !== null
      ? inArray(buildOwnedParts.partNum, [...allowedPartNums])
      : undefined;

  const [countRow] = await userDb
    .select({ c: count() })
    .from(buildOwnedParts)
    .where(whereClause);

  const totalRows = Number(countRow?.c ?? 0);
  if (totalRows === 0) {
    return { rows: [], totalRows: 0, hasMore: false };
  }

  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, limit);

  const ownedRows = await userDb
    .select({
      partNum: buildOwnedParts.partNum,
      colorId: buildOwnedParts.colorId,
      quantity: buildOwnedParts.quantity,
    })
    .from(buildOwnedParts)
    .where(whereClause)
    .orderBy(asc(buildOwnedParts.partNum), asc(buildOwnedParts.colorId))
    .limit(safeLimit)
    .offset(safeOffset);

  const rows = await attachColorNames(ownedRows);
  return {
    rows,
    totalRows,
    hasMore: safeOffset + rows.length < totalRows,
  };
}

export async function loadOwnedCategorySummary(): Promise<{
  stats: OwnedPartsStats;
  categories: OwnedCategorySummaryRow[];
  uncategorizedCount: number;
}> {
  const stats = await loadOwnedPartsStats();
  if (stats.totalRows === 0) {
    return { stats, categories: [], uncategorizedCount: 0 };
  }

  const userDb = getUserDb();
  const ownedRows = await userDb
    .select({
      partNum: buildOwnedParts.partNum,
      colorId: buildOwnedParts.colorId,
    })
    .from(buildOwnedParts);

  const partNums = [...new Set(ownedRows.map((r) => r.partNum))];
  const catByPart = await loadOwnedPartCatByNum(partNums);

  const countByCatId = new Map<number, number>();
  const heroPartByCatId = new Map<number, string>();
  let uncategorizedCount = 0;
  let uncategorizedHeroPart: string | null = null;

  for (const row of ownedRows) {
    const catId = catByPart.get(row.partNum);
    if (catId == null) {
      uncategorizedCount++;
      uncategorizedHeroPart ??= row.partNum;
      continue;
    }
    countByCatId.set(catId, (countByCatId.get(catId) ?? 0) + 1);
    if (!heroPartByCatId.has(catId)) heroPartByCatId.set(catId, row.partNum);
  }

  const catIds = [...countByCatId.keys()];
  const catalogDb = getCatalogDb();
  const categoryRows =
    catIds.length > 0
      ? await catalogDb
          .select({ id: partCategories.id, name: partCategories.name })
          .from(partCategories)
          .where(inArray(partCategories.id, catIds))
      : [];

  const heroPartNums = [
    ...new Set([
      ...heroPartByCatId.values(),
      ...(uncategorizedHeroPart ? [uncategorizedHeroPart] : []),
    ]),
  ];
  const heroByPartNum = new Map<string, string>();
  if (heroPartNums.length > 0) {
    const heroRows = await catalogDb
      .select({ partNum: inventoryParts.partNum, thumb: min(inventoryParts.imgUrl) })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, heroPartNums),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum);
    for (const r of heroRows) {
      if (r.thumb && usableImgUrl(r.thumb)) heroByPartNum.set(r.partNum, r.thumb.trim());
    }
  }

  const categories: OwnedCategorySummaryRow[] = categoryRows
    .map((c) => ({
      id: c.id,
      name: (c.name ?? "").trim() || `分类 ${c.id}`,
      count: countByCatId.get(c.id) ?? 0,
      hero: heroByPartNum.get(heroPartByCatId.get(c.id) ?? "") ?? null,
    }))
    .filter((c) => c.count > 0)
    .sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN")
    );

  return { stats, categories, uncategorizedCount };
}

export async function loadOwnedCategoryLabel(filter: OwnedCategoryFilter): Promise<string> {
  if (filter === "all") return "全部零件库";
  if (filter === "uncategorized") return "未分类";

  const catalogDb = getCatalogDb();
  const [row] = await catalogDb
    .select({ name: partCategories.name })
    .from(partCategories)
    .where(eq(partCategories.id, filter));
  return (row?.name ?? "").trim() || `分类 ${filter}`;
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

/** 某零件在零件库表中的合计数量（按颜色汇总） */
export async function loadOwnedQtyForPart(partNum: string): Promise<number> {
  const userDb = getUserDb();
  const [row] = await userDb
    .select({ total: sum(buildOwnedParts.quantity).mapWith(Number) })
    .from(buildOwnedParts)
    .where(eq(buildOwnedParts.partNum, partNum));
  return row?.total ?? 0;
}
