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
  buildPurchaseListItems,
  colors,
  elements,
  inventoryParts,
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";
import type { OwnedCategoryFilter } from "@/lib/owned-parts-category";
import type { OwnedSortDir, OwnedSortState } from "@/lib/owned-parts-sort";
import { OWNED_DEFAULT_SORT } from "@/lib/owned-parts-sort";

export const PURCHASE_LIST_PAGE_SIZE = 40;

export type PurchaseViewMode = "part" | "element";

export type PurchaseListStats = {
  totalRows: number;
  totalQty: number;
  uniqueParts: number;
};

export type PurchaseCategorySummaryRow = {
  id: number;
  name: string;
  count: number;
};

export type PurchasePartPageRow = {
  partNum: string;
  name: string;
  /** 仅有色行合计 */
  totalQty: number;
  lineCount: number;
  /** 尚无有色行（待选色） */
  pendingColor: boolean;
  thumbUrl: string | null;
  isPrinted: boolean;
  updatedAt: string;
};

export type PurchaseElementPageRow = {
  id: number;
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

type PurchasePartAgg = {
  partNum: string;
  totalQty: number;
  lineCount: number;
  pendingColor: boolean;
  updatedAt: string;
};

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export function parsePurchaseViewParam(raw: string | undefined): PurchaseViewMode {
  return raw === "element" ? "element" : "part";
}

export async function isPartInPurchaseList(partNum: string): Promise<boolean> {
  const trimmed = partNum.trim();
  if (!trimmed) return false;
  const userDb = getUserDb();
  const [row] = await userDb
    .select({ id: buildPurchaseListItems.id })
    .from(buildPurchaseListItems)
    .where(eq(buildPurchaseListItems.partNum, trimmed))
    .limit(1);
  return Boolean(row);
}

/** 返回传入零件号中已在购买清单的集合 */
export async function loadPurchaseListPartNums(
  partNums: readonly string[]
): Promise<Set<string>> {
  const unique = [...new Set(partNums.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();
  const userDb = getUserDb();
  const rows = await userDb
    .select({ partNum: buildPurchaseListItems.partNum })
    .from(buildPurchaseListItems)
    .where(inArray(buildPurchaseListItems.partNum, unique));
  return new Set(rows.map((r) => r.partNum));
}

export async function loadPurchaseListStats(): Promise<PurchaseListStats> {
  const userDb = getUserDb();
  const [statsRow] = await userDb
    .select({
      totalRows: count(),
      uniqueParts: countDistinct(buildPurchaseListItems.partNum),
      totalQty: sum(buildPurchaseListItems.quantity).mapWith(Number),
    })
    .from(buildPurchaseListItems)
    .where(isNotNull(buildPurchaseListItems.colorId));

  const [partCountRow] = await userDb
    .select({
      uniqueParts: countDistinct(buildPurchaseListItems.partNum),
    })
    .from(buildPurchaseListItems);

  return {
    totalRows: Number(statsRow?.totalRows ?? 0),
    totalQty: statsRow?.totalQty ?? 0,
    uniqueParts: Number(partCountRow?.uniqueParts ?? 0),
  };
}

/** 某零件各颜色待购数量（仅有色行） */
export async function loadPurchaseQtyByColorForPart(
  partNum: string
): Promise<Map<number, number>> {
  const trimmed = partNum.trim();
  const map = new Map<number, number>();
  if (!trimmed) return map;

  const userDb = getUserDb();
  const rows = await userDb
    .select({
      colorId: buildPurchaseListItems.colorId,
      quantity: buildPurchaseListItems.quantity,
    })
    .from(buildPurchaseListItems)
    .where(
      and(
        eq(buildPurchaseListItems.partNum, trimmed),
        isNotNull(buildPurchaseListItems.colorId)
      )
    );

  for (const r of rows) {
    if (r.colorId != null && r.quantity > 0) map.set(r.colorId, r.quantity);
  }
  return map;
}

async function loadPurchasePartCatByNum(
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

async function loadAllPurchasePartAggs(): Promise<PurchasePartAgg[]> {
  const userDb = getUserDb();
  const rows = await userDb
    .select({
      partNum: buildPurchaseListItems.partNum,
      colorId: buildPurchaseListItems.colorId,
      quantity: buildPurchaseListItems.quantity,
      updatedAt: buildPurchaseListItems.updatedAt,
    })
    .from(buildPurchaseListItems);

  const byPart = new Map<
    string,
    { totalQty: number; lineCount: number; colored: number; updatedAt: string }
  >();
  for (const r of rows) {
    const cur = byPart.get(r.partNum) ?? {
      totalQty: 0,
      lineCount: 0,
      colored: 0,
      updatedAt: "",
    };
    cur.lineCount += 1;
    if (r.colorId != null) {
      cur.colored += 1;
      cur.totalQty += r.quantity > 0 ? r.quantity : 0;
    }
    const ua = r.updatedAt ?? "";
    if (ua > cur.updatedAt) cur.updatedAt = ua;
    byPart.set(r.partNum, cur);
  }

  return [...byPart.entries()].map(([partNum, v]) => ({
    partNum,
    totalQty: v.totalQty,
    lineCount: v.lineCount,
    pendingColor: v.colored === 0,
    updatedAt: v.updatedAt,
  }));
}

async function loadMinColorIdByPart(
  partNums: readonly string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (partNums.length === 0) return map;
  const userDb = getUserDb();
  const rows = await userDb
    .select({
      partNum: buildPurchaseListItems.partNum,
      colorId: min(buildPurchaseListItems.colorId),
    })
    .from(buildPurchaseListItems)
    .where(
      and(
        inArray(buildPurchaseListItems.partNum, [...partNums]),
        isNotNull(buildPurchaseListItems.colorId)
      )
    )
    .groupBy(buildPurchaseListItems.partNum);
  for (const r of rows) {
    if (r.colorId != null) map.set(r.partNum, r.colorId);
  }
  return map;
}

async function loadCategorySortMeta(
  partNums: readonly string[]
): Promise<{
  catIdByPart: Map<string, number | null>;
  catNameById: Map<number, string>;
}> {
  const catIdByPart = await loadPurchasePartCatByNum(partNums);
  const catIds = [
    ...new Set(
      [...catIdByPart.values()].filter((id): id is number => id != null)
    ),
  ];
  const catNameById = new Map<number, string>();
  if (catIds.length === 0) return { catIdByPart, catNameById };

  const catalogDb = getCatalogDb();
  const nameRows = await catalogDb
    .select({ id: partCategories.id, name: partCategories.name })
    .from(partCategories)
    .where(inArray(partCategories.id, catIds));
  for (const r of nameRows) {
    catNameById.set(r.id, (r.name ?? "").trim() || `分类 ${r.id}`);
  }
  return { catIdByPart, catNameById };
}

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  const aMissing = a == null;
  const bMissing = b == null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a - b;
}

function withDir(cmp: number, dir: OwnedSortDir): number {
  return dir === "desc" ? -cmp : cmp;
}

function sortPurchasePartAggs(
  rows: PurchasePartAgg[],
  sort: OwnedSortState,
  opts: {
    minColorByPart?: Map<string, number>;
    catIdByPart?: Map<string, number | null>;
    catNameById?: Map<number, string>;
  }
): PurchasePartAgg[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    let primary = 0;
    if (sort.key === "qty") {
      primary = a.totalQty - b.totalQty;
    } else if (sort.key === "color") {
      const ca = opts.minColorByPart?.get(a.partNum);
      const cb = opts.minColorByPart?.get(b.partNum);
      primary = compareNullableNumber(ca, cb);
    } else if (sort.key === "category") {
      const idA = opts.catIdByPart?.get(a.partNum) ?? null;
      const idB = opts.catIdByPart?.get(b.partNum) ?? null;
      const nameA = idA == null ? "\uffff" : opts.catNameById?.get(idA) ?? "";
      const nameB = idB == null ? "\uffff" : opts.catNameById?.get(idB) ?? "";
      primary = nameA.localeCompare(nameB, "zh-Hans-CN");
    } else {
      primary = a.partNum.localeCompare(b.partNum, "en");
    }
    return withDir(primary, sort.dir) || a.partNum.localeCompare(b.partNum, "en");
  });
  return copy;
}

function filterAggsByCat(
  aggs: PurchasePartAgg[],
  catByPart: Map<string, number | null>,
  catFilter: OwnedCategoryFilter
): PurchasePartAgg[] {
  if (catFilter === "all") return aggs;
  if (catFilter === "uncategorized") {
    return aggs.filter((r) => catByPart.get(r.partNum) == null);
  }
  return aggs.filter((r) => catByPart.get(r.partNum) === catFilter);
}

function filterRowsByCat<T extends { partNum: string }>(
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

export async function loadPurchaseCategorySummary(): Promise<{
  total: number;
  stats: PurchaseListStats;
  categories: PurchaseCategorySummaryRow[];
  uncategorizedCount: number;
}> {
  const [stats, aggs] = await Promise.all([
    loadPurchaseListStats(),
    loadAllPurchasePartAggs(),
  ]);
  const total = aggs.length;
  if (total === 0) {
    return { total: 0, stats, categories: [], uncategorizedCount: 0 };
  }

  const catByPart = await loadPurchasePartCatByNum(aggs.map((r) => r.partNum));
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

export async function loadPurchaseCategoryLabel(
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

export async function loadPurchasePartsPage(
  page: number,
  pageSize = PURCHASE_LIST_PAGE_SIZE,
  catFilter: OwnedCategoryFilter = "all",
  sort: OwnedSortState = OWNED_DEFAULT_SORT
): Promise<{ total: number; page: number; rows: PurchasePartPageRow[] }> {
  const allAggs = await loadAllPurchasePartAggs();
  if (allAggs.length === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const allPartNums = allAggs.map((r) => r.partNum);
  const needsCatMeta = catFilter !== "all" || sort.key === "category";
  const catByPart = needsCatMeta
    ? await loadPurchasePartCatByNum(allPartNums)
    : new Map<string, number | null>();

  const filtered = filterAggsByCat(allAggs, catByPart, catFilter);
  if (filtered.length === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  let minColorByPart: Map<string, number> | undefined;
  let catNameById: Map<number, string> | undefined;
  if (sort.key === "color") {
    minColorByPart = await loadMinColorIdByPart(filtered.map((r) => r.partNum));
  } else if (sort.key === "category") {
    const meta = await loadCategorySortMeta(filtered.map((r) => r.partNum));
    catNameById = meta.catNameById;
  }

  const sorted = sortPurchasePartAggs(filtered, sort, {
    minColorByPart,
    catIdByPart: catByPart,
    catNameById,
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(totalPages, Math.max(1, page));
  const offset = (safePage - 1) * pageSize;

  const pageAggs = sorted.slice(offset, offset + pageSize);
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
      lineCount: r.lineCount,
      pendingColor: r.pendingColor,
      thumbUrl: thumbByPart.get(r.partNum) ?? null,
      isPrinted: printedPartNums.has(r.partNum),
      updatedAt: r.updatedAt,
    })),
  };
}

export async function loadPurchaseElementsPage(
  page: number,
  pageSize = PURCHASE_LIST_PAGE_SIZE,
  catFilter: OwnedCategoryFilter = "all",
  sort: OwnedSortState = OWNED_DEFAULT_SORT
): Promise<{ total: number; page: number; rows: PurchaseElementPageRow[] }> {
  const userDb = getUserDb();
  const allRows = await userDb
    .select({
      id: buildPurchaseListItems.id,
      partNum: buildPurchaseListItems.partNum,
      colorId: buildPurchaseListItems.colorId,
      quantity: buildPurchaseListItems.quantity,
      updatedAt: buildPurchaseListItems.updatedAt,
    })
    .from(buildPurchaseListItems)
    .where(isNotNull(buildPurchaseListItems.colorId));

  const baseRows = allRows
    .filter((r) => r.colorId != null && r.quantity > 0)
    .map((r) => ({
      id: r.id,
      partNum: r.partNum,
      colorId: r.colorId as number,
      quantity: r.quantity,
      updatedAt: r.updatedAt ?? "",
    }));

  if (baseRows.length === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const partNumsAll = [...new Set(baseRows.map((r) => r.partNum))];
  const needsCatMeta = catFilter !== "all" || sort.key === "category";
  const catByPart = needsCatMeta
    ? await loadPurchasePartCatByNum(partNumsAll)
    : new Map<string, number | null>();

  const filtered = filterRowsByCat(baseRows, catByPart, catFilter);
  if (filtered.length === 0) {
    return { total: 0, page: 1, rows: [] };
  }

  const filteredPartNums = [...new Set(filtered.map((r) => r.partNum))];
  const filteredColorIds = [
    ...new Set(
      filtered
        .map((r) => r.colorId)
        .filter((id): id is number => id != null)
    ),
  ];
  const catalogDb = getCatalogDb();

  let elementByPartColor = new Map<string, string>();
  let catNameById = new Map<number, string>();
  if (sort.key === "id" || sort.key === "category") {
    const [elementRows, catMeta] = await Promise.all([
      sort.key === "id" && filteredColorIds.length > 0
        ? catalogDb
            .select({
              partNum: elements.partNum,
              colorId: elements.colorId,
              elementId: elements.elementId,
            })
            .from(elements)
            .where(
              and(
                inArray(elements.partNum, filteredPartNums),
                inArray(elements.colorId, filteredColorIds)
              )
            )
            .orderBy(asc(elements.elementId))
        : Promise.resolve(
            [] as { partNum: string; colorId: number; elementId: string }[]
          ),
      sort.key === "category"
        ? loadCategorySortMeta(filteredPartNums)
        : Promise.resolve({
            catIdByPart: catByPart,
            catNameById: new Map<number, string>(),
          }),
    ]);
    for (const e of elementRows) {
      const key = `${e.partNum}\0${e.colorId}`;
      if (!elementByPartColor.has(key)) {
        elementByPartColor.set(key, e.elementId);
      }
    }
    if (sort.key === "category") {
      catNameById = catMeta.catNameById;
      for (const [k, v] of catMeta.catIdByPart) catByPart.set(k, v);
    }
  }

  const sorted = [...filtered].sort((a, b) => {
    let primary = 0;
    if (sort.key === "qty") {
      primary = a.quantity - b.quantity;
    } else if (sort.key === "color") {
      primary = a.colorId - b.colorId;
    } else if (sort.key === "category") {
      const idA = catByPart.get(a.partNum) ?? null;
      const idB = catByPart.get(b.partNum) ?? null;
      const nameA = idA == null ? "\uffff" : catNameById.get(idA) ?? "";
      const nameB = idB == null ? "\uffff" : catNameById.get(idB) ?? "";
      primary = nameA.localeCompare(nameB, "zh-Hans-CN");
    } else {
      const keyA =
        elementByPartColor.get(`${a.partNum}\0${a.colorId}`) ??
        `\uffff${a.partNum}/${a.colorId}`;
      const keyB =
        elementByPartColor.get(`${b.partNum}\0${b.colorId}`) ??
        `\uffff${b.partNum}/${b.colorId}`;
      primary =
        a.partNum.localeCompare(b.partNum, "en") ||
        keyA.localeCompare(keyB, "en");
    }
    return (
      withDir(primary, sort.dir) ||
      a.partNum.localeCompare(b.partNum, "en") ||
      a.colorId - b.colorId ||
      a.id - b.id
    );
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(totalPages, Math.max(1, page));
  const offset = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(offset, offset + pageSize);
  if (pageRows.length === 0) {
    return { total, page: safePage, rows: [] };
  }

  const partNums = [...new Set(pageRows.map((r) => r.partNum))];
  const colorIds = [
    ...new Set(
      pageRows.map((r) => r.colorId).filter((id): id is number => id != null)
    ),
  ];

  const [nameRows, colorRows, elementRows, thumbRows, printedRows, partThumbs] =
    await Promise.all([
      catalogDb
        .select({ partNum: parts.partNum, name: parts.name })
        .from(parts)
        .where(inArray(parts.partNum, partNums)),
      colorIds.length > 0
        ? catalogDb
            .select({ id: colors.id, name: colors.name, rgb: colors.rgb })
            .from(colors)
            .where(inArray(colors.id, colorIds))
        : Promise.resolve([] as { id: number; name: string; rgb: string }[]),
      colorIds.length > 0
        ? catalogDb
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
            .orderBy(asc(elements.elementId))
        : Promise.resolve(
            [] as { partNum: string; colorId: number; elementId: string }[]
          ),
      colorIds.length > 0
        ? catalogDb
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
            .groupBy(inventoryParts.partNum, inventoryParts.colorId)
        : Promise.resolve(
            [] as {
              partNum: string;
              colorId: number;
              thumb: string | null;
            }[]
          ),
      catalogDb
        .select({ partNum: partRelationships.childPartNum })
        .from(partRelationships)
        .where(
          and(
            inArray(partRelationships.childPartNum, partNums),
            eq(partRelationships.relType, "P")
          )
        ),
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
    ]);

  const nameByPart = new Map(nameRows.map((r) => [r.partNum, r.name]));
  const colorMeta = new Map<number, { name: string; rgb: string }>();
  for (const c of colorRows) {
    colorMeta.set(c.id, {
      name: (c.name ?? "").trim() || "未知颜色",
      rgb: (c.rgb ?? "CCCCCC").trim() || "CCCCCC",
    });
  }
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
  const thumbByPart = new Map<string, string>();
  for (const t of partThumbs) {
    if (t.thumb?.trim()) thumbByPart.set(t.partNum, t.thumb.trim());
  }
  const printedPartNums = new Set(printedRows.map((r) => r.partNum));

  return {
    total,
    page: safePage,
    rows: pageRows.map((r) => {
      const key = `${r.partNum}\0${r.colorId}`;
      const meta = colorMeta.get(r.colorId);
      return {
        id: r.id,
        partNum: r.partNum,
        partName: (nameByPart.get(r.partNum) ?? r.partNum).trim() || r.partNum,
        elementId: elementByPartColor.get(key) ?? null,
        colorId: r.colorId,
        colorName: meta?.name ?? "未知颜色",
        rgb: meta?.rgb ?? "CCCCCC",
        quantity: r.quantity,
        thumbUrl:
          thumbByPartColor.get(key) ?? thumbByPart.get(r.partNum) ?? null,
        isPrinted: printedPartNums.has(r.partNum),
        updatedAt: r.updatedAt,
      };
    }),
  };
}

