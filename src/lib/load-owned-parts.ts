import "server-only";

import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  max,
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

export const OWNED_PARTS_PAGE_SIZE = 40;

export type OwnedViewMode = "part" | "element";

export type OwnedPartsStats = {
  totalRows: number;
  totalQty: number;
  uniqueParts: number;
};

export type OwnedCategorySummaryRow = {
  id: number;
  name: string;
  count: number;
};

export type OwnedPartPageRow = {
  partNum: string;
  name: string;
  totalQty: number;
  thumbUrl: string | null;
  isPrinted: boolean;
  updatedAt: string;
};

export type OwnedElementPageRow = {
  partNum: string;
  partName: string;
  elementId: string | null;
  colorId: number;
  colorName: string;
  rgb: string;
  quantity: number;
  thumbUrl: string | null;
  isPrinted: boolean;
  updatedAt: string;
};

type OwnedPartAgg = {
  partNum: string;
  totalQty: number;
  updatedAt: string;
};

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export function parseOwnedViewParam(raw: string | undefined): OwnedViewMode {
  return raw === "element" ? "element" : "part";
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

async function loadOwnedPartCatByNum(
  partNums: readonly string[]
): Promise<Map<string, number | null>> {
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

async function loadAllOwnedPartAggs(): Promise<OwnedPartAgg[]> {
  const userDb = getUserDb();
  const rows = await userDb
    .select({
      partNum: buildOwnedParts.partNum,
      totalQty: sum(buildOwnedParts.quantity).mapWith(Number),
      updatedAt: max(buildOwnedParts.updatedAt),
    })
    .from(buildOwnedParts)
    .groupBy(buildOwnedParts.partNum);

  return rows
    .map((r) => ({
      partNum: r.partNum,
      totalQty: r.totalQty ?? 0,
      updatedAt: r.updatedAt ?? "",
    }))
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.partNum.localeCompare(b.partNum, "en")
    );
}

function filterOwnedAggsByCat(
  aggs: OwnedPartAgg[],
  catByPart: Map<string, number | null>,
  catFilter: OwnedCategoryFilter
): OwnedPartAgg[] {
  if (catFilter === "all") return aggs;
  if (catFilter === "uncategorized") {
    return aggs.filter((r) => {
      const catId = catByPart.get(r.partNum);
      return catId == null;
    });
  }
  return aggs.filter((r) => catByPart.get(r.partNum) === catFilter);
}

function filterOwnedColorRowsByCat<T extends { partNum: string }>(
  rows: T[],
  catByPart: Map<string, number | null>,
  catFilter: OwnedCategoryFilter
): T[] {
  if (catFilter === "all") return rows;
  if (catFilter === "uncategorized") {
    return rows.filter((r) => catByPart.get(r.partNum) == null);
  }
  return rows.filter((r) => catByPart.get(r.partNum) === catFilter);
}

export async function loadOwnedCategorySummary(): Promise<{
  total: number;
  stats: OwnedPartsStats;
  categories: OwnedCategorySummaryRow[];
  uncategorizedCount: number;
}> {
  const [stats, aggs] = await Promise.all([
    loadOwnedPartsStats(),
    loadAllOwnedPartAggs(),
  ]);
  const total = aggs.length;
  if (total === 0) {
    return { total: 0, stats, categories: [], uncategorizedCount: 0 };
  }

  const catByPart = await loadOwnedPartCatByNum(aggs.map((r) => r.partNum));
  const countByCatId = new Map<number, number>();
  let uncategorizedCount = 0;
  for (const r of aggs) {
    const catId = catByPart.get(r.partNum);
    if (catId == null) {
      uncategorizedCount += 1;
      continue;
    }
    countByCatId.set(catId, (countByCatId.get(catId) ?? 0) + 1);
  }

  const catIds = [...countByCatId.keys()];
  if (catIds.length === 0) {
    return { total, stats, categories: [], uncategorizedCount };
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

  return { total, stats, categories, uncategorizedCount };
}

export async function loadOwnedCategoryLabel(
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

/** 某零件在零件库表中的合计数量（按颜色汇总） */
export async function loadOwnedQtyForPart(partNum: string): Promise<number> {
  const userDb = getUserDb();
  const [row] = await userDb
    .select({ total: sum(buildOwnedParts.quantity).mapWith(Number) })
    .from(buildOwnedParts)
    .where(eq(buildOwnedParts.partNum, partNum));
  return row?.total ?? 0;
}

/** 某零件各颜色库存数量 */
export async function loadOwnedQtyByColorForPart(
  partNum: string
): Promise<Map<number, number>> {
  const trimmed = partNum.trim();
  const map = new Map<number, number>();
  if (!trimmed) return map;

  const userDb = getUserDb();
  const rows = await userDb
    .select({
      colorId: buildOwnedParts.colorId,
      quantity: buildOwnedParts.quantity,
    })
    .from(buildOwnedParts)
    .where(eq(buildOwnedParts.partNum, trimmed));

  for (const r of rows) {
    if (r.quantity > 0) map.set(r.colorId, r.quantity);
  }
  return map;
}

export async function loadOwnedPartsPage(
  page: number,
  pageSize = OWNED_PARTS_PAGE_SIZE,
  catFilter: OwnedCategoryFilter = "all"
): Promise<{ total: number; page: number; rows: OwnedPartPageRow[] }> {
  const allAggs = await loadAllOwnedPartAggs();
  if (allAggs.length === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const catByPart =
    catFilter === "all"
      ? new Map<string, number | null>()
      : await loadOwnedPartCatByNum(allAggs.map((r) => r.partNum));

  const filtered = filterOwnedAggsByCat(allAggs, catByPart, catFilter);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(totalPages, Math.max(1, page));
  const offset = (safePage - 1) * pageSize;

  if (total === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const pageAggs = filtered.slice(offset, offset + pageSize);
  if (pageAggs.length === 0) {
    return { total, page: safePage, rows: [] };
  }

  const partNums = pageAggs.map((r) => r.partNum);
  const catalogDb = getCatalogDb();

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
    rows: pageAggs.map((r) => ({
      partNum: r.partNum,
      name: (nameByPart.get(r.partNum) ?? r.partNum).trim() || r.partNum,
      totalQty: r.totalQty,
      thumbUrl: thumbByPart.get(r.partNum) ?? null,
      isPrinted: printedPartNums.has(r.partNum),
      updatedAt: r.updatedAt,
    })),
  };
}

export async function loadOwnedElementsPage(
  page: number,
  pageSize = OWNED_PARTS_PAGE_SIZE,
  catFilter: OwnedCategoryFilter = "all"
): Promise<{ total: number; page: number; rows: OwnedElementPageRow[] }> {
  const userDb = getUserDb();
  const allRows = await userDb
    .select({
      partNum: buildOwnedParts.partNum,
      colorId: buildOwnedParts.colorId,
      quantity: buildOwnedParts.quantity,
      updatedAt: buildOwnedParts.updatedAt,
    })
    .from(buildOwnedParts);

  const sorted = allRows
    .filter((r) => r.quantity > 0)
    .map((r) => ({
      partNum: r.partNum,
      colorId: r.colorId,
      quantity: r.quantity,
      updatedAt: r.updatedAt ?? "",
    }))
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.partNum.localeCompare(b.partNum, "en") ||
        a.colorId - b.colorId
    );

  if (sorted.length === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const partNumsAll = [...new Set(sorted.map((r) => r.partNum))];
  const catByPart =
    catFilter === "all"
      ? new Map<string, number | null>()
      : await loadOwnedPartCatByNum(partNumsAll);

  const filtered = filterOwnedColorRowsByCat(sorted, catByPart, catFilter);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(totalPages, Math.max(1, page));
  const offset = (safePage - 1) * pageSize;

  if (total === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const pageRows = filtered.slice(offset, offset + pageSize);
  if (pageRows.length === 0) {
    return { total, page: safePage, rows: [] };
  }

  const partNums = [...new Set(pageRows.map((r) => r.partNum))];
  const colorIds = [...new Set(pageRows.map((r) => r.colorId))];
  const catalogDb = getCatalogDb();

  const [nameRows, colorRows, elementRows, thumbRows, printedRows] =
    await Promise.all([
      catalogDb
        .select({ partNum: parts.partNum, name: parts.name })
        .from(parts)
        .where(inArray(parts.partNum, partNums)),
      catalogDb
        .select({ id: colors.id, name: colors.name, rgb: colors.rgb })
        .from(colors)
        .where(inArray(colors.id, colorIds)),
      catalogDb
        .select({
          partNum: elements.partNum,
          colorId: elements.colorId,
          elementId: elements.elementId,
        })
        .from(elements)
        .where(
          and(
            inArray(elements.partNum, partNums),
            inArray(elements.colorId, colorIds)
          )
        )
        .orderBy(asc(elements.elementId)),
      catalogDb
        .select({
          partNum: inventoryParts.partNum,
          colorId: inventoryParts.colorId,
          thumb: min(inventoryParts.imgUrl),
        })
        .from(inventoryParts)
        .where(
          and(
            inArray(inventoryParts.partNum, partNums),
            inArray(inventoryParts.colorId, colorIds),
            isNotNull(inventoryParts.imgUrl),
            ne(inventoryParts.imgUrl, "")
          )
        )
        .groupBy(inventoryParts.partNum, inventoryParts.colorId),
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
  const colorMeta = new Map<number, { name: string; rgb: string }>();
  for (const c of colorRows) {
    colorMeta.set(c.id, {
      name: (c.name ?? "").trim() || "未知颜色",
      rgb: (c.rgb ?? "CCCCCC").trim() || "CCCCCC",
    });
  }
  const elementByPartColor = new Map<string, string>();
  for (const e of elementRows) {
    const key = `${e.partNum}\0${e.colorId}`;
    if (!elementByPartColor.has(key)) {
      elementByPartColor.set(key, e.elementId);
    }
  }
  const thumbByPartColor = new Map<string, string>();
  for (const t of thumbRows) {
    if (t.thumb && usableImgUrl(t.thumb)) {
      thumbByPartColor.set(`${t.partNum}\0${t.colorId}`, t.thumb.trim());
    }
  }
  const printedPartNums = new Set(printedRows.map((r) => r.partNum));

  return {
    total,
    page: safePage,
    rows: pageRows.map((r) => {
      const key = `${r.partNum}\0${r.colorId}`;
      const meta = colorMeta.get(r.colorId);
      return {
        partNum: r.partNum,
        partName: (nameByPart.get(r.partNum) ?? r.partNum).trim() || r.partNum,
        elementId: elementByPartColor.get(key) ?? null,
        colorId: r.colorId,
        colorName: meta?.name ?? "未知颜色",
        rgb: meta?.rgb ?? "CCCCCC",
        quantity: r.quantity,
        thumbUrl: thumbByPartColor.get(key) ?? null,
        isPrinted: printedPartNums.has(r.partNum),
        updatedAt: r.updatedAt,
      };
    }),
  };
}
