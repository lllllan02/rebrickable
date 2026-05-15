"use server";

import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNotNull,
  like,
  min,
  ne,
  notExists,
  or,
  type SQL,
} from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import {
  colors,
  elements,
  inventoryParts,
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";
import { fetchPartSubstituteSuggestions } from "@/lib/part-substitute-suggestions-server";
import { likeFragment } from "@/lib/search";
import {
  fetchGobricksItemFilterInStockColors,
  fetchGobricksSearchItemHits,
  parseGobricksProductIdFromGdsItemId,
  resolveGobricksProductIdForPartNum,
  searchGobricksProductIdByLegoDesignId,
} from "@/lib/gobricks-item-filter-inventory";

const MAX_Q_LEN = 80;
const MAX_PART_NUM_LEN = 32;
const MAX_PART_ROWS = 160;
/** 乐高 A/M 推荐零件较多时，限制并行高砖搜索次数，避免一次打开弹层触发过多外呼 */
const MAX_LEGO_SUBSTITUTE_GOBRICKS_QUERIES = 16;

export type SheetReplaceCategoryRow = {
  id: number;
  name: string;
  /** 该类型下清单零件的示意缩略图（与零件页分类入口一致） */
  heroImgUrl: string | null;
};

export type SheetReplacePieceFilter = "all" | "plain" | "printed";

export type SheetReplacePartHit = {
  partNum: string;
  name: string;
  imgUrl: string | null;
};

/** 更换零件第一步：高砖站内搜索结果（含 `product_id`，选色时直拉库存接口） */
export type SheetReplaceGobricksSearchHit = {
  productId: string;
  partNum: string;
  name: string;
  imgUrl: string | null;
};

export type SheetReplaceColorRow = {
  id: number;
  name: string;
  rgb: string;
  isTrans: boolean;
};

/** 选色步：仅高砖有货 SKU，与本地 colors 对齐；展示名以高砖中/英为主 */
export type SheetReplaceGobricksStockColor = {
  colorId: number;
  /** 目录色名（筛选兜底） */
  name: string;
  nameZh: string;
  nameEn: string;
  rgb: string;
  isTrans: boolean;
  picture: string | null;
  inventory: number;
  /** 高砖 SKU（如 GDS-656-072） */
  gdsItemId: string;
  /** 高砖 color_id */
  gdsColorId: string;
};

export async function listPartCategoriesForSheetReplaceAction(): Promise<
  | { ok: true; categories: SheetReplaceCategoryRow[] }
  | { ok: false; error: string }
> {
  try {
    const db = getCatalogDb();
    const [catRows, heroRows] = await Promise.all([
      db
        .select({ id: partCategories.id, name: partCategories.name })
        .from(partCategories)
        .orderBy(asc(partCategories.name)),
      db
        .select({
          catId: parts.partCatId,
          thumb: min(inventoryParts.imgUrl),
        })
        .from(parts)
        .innerJoin(inventoryParts, eq(parts.partNum, inventoryParts.partNum))
        .where(
          and(
            isNotNull(parts.partCatId),
            isNotNull(inventoryParts.imgUrl),
            ne(inventoryParts.imgUrl, "")
          )
        )
        .groupBy(parts.partCatId),
    ]);

    const heroByCatId = new Map<number, string>();
    for (const h of heroRows) {
      if (h.catId != null && h.thumb?.trim()) {
        heroByCatId.set(h.catId, h.thumb.trim());
      }
    }

    const categories: SheetReplaceCategoryRow[] = catRows.map((c) => ({
      id: c.id,
      name: c.name,
      heroImgUrl: heroByCatId.get(c.id) ?? null,
    }));

    return { ok: true, categories };
  } catch {
    return { ok: false, error: "读取零件类型失败。" };
  }
}

export async function getDefaultPartCategoryForSheetReplaceAction(
  partNumRaw: string
): Promise<{ ok: true; partCatId: number | null } | { ok: false; error: string }> {
  const partNum = partNumRaw.trim().slice(0, MAX_PART_NUM_LEN);
  if (!partNum) return { ok: true, partCatId: null };
  try {
    const db = getCatalogDb();
    const rows = await db
      .select({ partCatId: parts.partCatId })
      .from(parts)
      .where(eq(parts.partNum, partNum))
      .limit(1);
    const id = rows[0]?.partCatId;
    return {
      ok: true,
      partCatId: typeof id === "number" && Number.isFinite(id) ? id : null,
    };
  } catch {
    return { ok: false, error: "读取当前零件类型失败。" };
  }
}

/**
 * 在指定类型（或全库）下按关键词搜索零件，并附 inventory 缩略图（任一角）。
 */
export async function searchPartsForSheetReplaceAction(input: {
  partCatId: number | "all";
  q: string;
  pieceFilter?: SheetReplacePieceFilter;
}): Promise<{ ok: true; parts: SheetReplacePartHit[] } | { ok: false; error: string }> {
  const q = likeFragment(input.q ?? "", MAX_Q_LEN);
  const cat = input.partCatId;
  const pieceFilter: SheetReplacePieceFilter = input.pieceFilter ?? "all";

  try {
    const db = getCatalogDb();

    const clauses: SQL[] = [];
    if (cat !== "all") {
      clauses.push(eq(parts.partCatId, cat));
    }
    if (q.length > 0) {
      const textOr = or(
        like(parts.name, `%${q}%`),
        like(parts.partNum, `%${q}%`),
        exists(
          db
            .select({ e: elements.elementId })
            .from(elements)
            .where(
              and(eq(elements.partNum, parts.partNum), like(elements.elementId, `%${q}%`))
            )
        )
      );
      if (textOr) clauses.push(textOr);
    }
    if (pieceFilter === "printed") {
      const printedExists = exists(
        db
          .select({ c: partRelationships.childPartNum })
          .from(partRelationships)
          .where(
            and(
              eq(partRelationships.relType, "P"),
              eq(partRelationships.childPartNum, parts.partNum)
            )
          )
      );
      clauses.push(printedExists);
    } else if (pieceFilter === "plain") {
      const plainClause = notExists(
        db
          .select({ c: partRelationships.childPartNum })
          .from(partRelationships)
          .where(
            and(
              eq(partRelationships.relType, "P"),
              eq(partRelationships.childPartNum, parts.partNum)
            )
          )
      );
      clauses.push(plainClause);
    }
    const where = clauses.length > 0 ? and(...clauses) : undefined;

    const rows = await db
      .select({
        partNum: parts.partNum,
        name: parts.name,
      })
      .from(parts)
      .where(where)
      .orderBy(asc(parts.partNum))
      .limit(MAX_PART_ROWS);

    const partNums = rows.map((r) => r.partNum);
    const thumbByPart = new Map<string, string>();
    if (partNums.length > 0) {
      const thumbRows = await db
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
        .groupBy(inventoryParts.partNum);
      for (const t of thumbRows) {
        if (t.thumb?.trim()) thumbByPart.set(t.partNum, t.thumb.trim());
      }
    }

    const partsOut: SheetReplacePartHit[] = rows.map((r) => ({
      partNum: r.partNum,
      name: r.name,
      imgUrl: thumbByPart.get(r.partNum) ?? null,
    }));

    return { ok: true, parts: partsOut };
  } catch {
    return { ok: false, error: "搜索零件失败。" };
  }
}

/**
 * 配货/缺件更换零件：按关键词调用高砖站内搜索（不查本地零件库）。
 */
export async function searchGobricksPartsForSheetReplaceAction(input: {
  q: string;
}): Promise<{ ok: true; parts: SheetReplaceGobricksSearchHit[] } | { ok: false; error: string }> {
  const q = likeFragment(input.q ?? "", MAX_Q_LEN);
  if (!q) return { ok: true, parts: [] };
  try {
    const res = await fetchGobricksSearchItemHits(q);
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      parts: res.hits.map((h) => ({
        productId: h.productId,
        partNum: h.legoPartNum,
        name: h.name,
        imgUrl: h.imgUrl,
      })),
    };
  } catch {
    return { ok: false, error: "高砖搜索失败。" };
  }
}

/**
 * 配货/缺件「更换零件」：按本地 `part_relationships` 的 A/M 推荐零件号依次查高砖站内搜索，
 * 合并去重（保留推荐顺序），供面板置顶展示；单次推荐条数有上限。
 */
export async function listGobricksHitsForLegoSubstitutePartsAction(input: {
  legoPartNum: string;
}): Promise<{ ok: true; parts: SheetReplaceGobricksSearchHit[] } | { ok: false; error: string }> {
  const pn = input.legoPartNum.trim().slice(0, MAX_PART_NUM_LEN);
  if (!pn) return { ok: true, parts: [] };
  try {
    const suggestions = await fetchPartSubstituteSuggestions(pn);
    if (suggestions.length === 0) return { ok: true, parts: [] };
    const queries = suggestions
      .map((s) => s.otherPartNum.trim())
      .filter(Boolean)
      .slice(0, MAX_LEGO_SUBSTITUTE_GOBRICKS_QUERIES);

    const batches = await Promise.all(
      queries.map(async (q) => {
        const frag = likeFragment(q, MAX_Q_LEN);
        if (!frag) return [];
        const res = await fetchGobricksSearchItemHits(frag);
        if (!res.ok) return [];
        return res.hits;
      })
    );

    const seen = new Set<string>();
    const parts: SheetReplaceGobricksSearchHit[] = [];
    for (const hits of batches) {
      for (const h of hits) {
        if (seen.has(h.productId)) continue;
        seen.add(h.productId);
        parts.push({
          productId: h.productId,
          partNum: h.legoPartNum,
          name: h.name,
          imgUrl: h.imgUrl,
        });
      }
    }
    return { ok: true, parts };
  } catch (e) {
    const msg = e instanceof Error && e.message.trim() ? e.message.trim() : "加载乐高推荐零件的高砖匹配失败。";
    return { ok: false, error: msg };
  }
}

/**
 * 某零件在 elements 表中出现过的颜色（官方配色），用于更换时选色。
 */
export async function listElementColorsForPartSheetReplaceAction(
  partNumRaw: string
): Promise<{ ok: true; colors: SheetReplaceColorRow[] } | { ok: false; error: string }> {
  const partNum = partNumRaw.trim().slice(0, MAX_PART_NUM_LEN);
  if (!partNum) return { ok: false, error: "零件号无效。" };

  try {
    const db = getCatalogDb();

    const colorIdRows = await db
      .select({ colorId: elements.colorId })
      .from(elements)
      .where(eq(elements.partNum, partNum))
      .groupBy(elements.colorId)
      .orderBy(asc(elements.colorId));

    if (colorIdRows.length === 0) {
      return { ok: true, colors: [] };
    }

    const ids = colorIdRows.map((r) => r.colorId);
    const order = new Map<number, number>();
    for (let i = 0; i < ids.length; i++) order.set(ids[i]!, i);
    const meta = await db
      .select({
        id: colors.id,
        name: colors.name,
        rgb: colors.rgb,
        isTrans: colors.isTrans,
      })
      .from(colors)
      .where(inArray(colors.id, ids));

    meta.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    const colorsOut: SheetReplaceColorRow[] = meta.map((c) => ({
      id: c.id,
      name: c.name,
      rgb: c.rgb,
      isTrans: c.isTrans,
    }));

    return { ok: true, colors: colorsOut };
  } catch {
    return { ok: false, error: "读取该零件可用颜色失败。" };
  }
}

/**
 * 更换零件选色：仅返回高砖 `item/filter`（hasInventory=YES）中有库存、且 `lego_color_id`
 * 能在本地 `colors` 表对上的配色；展示用高砖返回的 `picture`。
 */
export async function listGobricksStockColorsForSheetReplaceAction(input: {
  partNum: string;
  sheetRowPartNum: string;
  sheetRowGdsItemId?: string | null;
  probeLegoColorId: number;
  /** 第一步从高砖搜索命中传入时可省略 lego2ItemList / 站内二次探测 */
  preresolvedProductId?: string | null;
  /** 为 true 时包含库存为 0 的 SKU（还原时按原 GDS 匹配） */
  includeZeroInventory?: boolean;
}): Promise<
  | { ok: true; variants: SheetReplaceGobricksStockColor[]; hint: string | null; productId: string }
  | { ok: false; error: string }
> {
  const partNum = input.partNum.trim().slice(0, MAX_PART_NUM_LEN);
  if (!partNum) return { ok: false, error: "零件号无效。" };

  const rowPn = input.sheetRowPartNum.trim().slice(0, MAX_PART_NUM_LEN);
  const probe = Math.trunc(Number(input.probeLegoColorId));
  const probeColorId = Number.isFinite(probe) && probe >= 0 ? probe : 0;

  try {
    let productId: string | null = null;
    const pre = input.preresolvedProductId?.trim() ?? "";
    if (pre && /^\d+$/.test(pre)) {
      productId = pre;
    }
    if (!productId && rowPn && partNum === rowPn) {
      productId = parseGobricksProductIdFromGdsItemId(input.sheetRowGdsItemId ?? null);
    }
    if (!productId) {
      try {
        productId = await resolveGobricksProductIdForPartNum(partNum, probeColorId);
      } catch {
        productId = null;
      }
    }
    if (!productId) {
      productId = await searchGobricksProductIdByLegoDesignId(partNum);
    }

    if (!productId) {
      return {
        ok: false,
        error:
          "未能解析该零件在高砖商城的 product_id（已尝试 GDS、lego2ItemList 与站内搜索），无法拉取有货颜色。",
      };
    }

    const stockRes = await fetchGobricksItemFilterInStockColors(productId, {
      includeZeroInventory: input.includeZeroInventory === true,
    });
    if (!stockRes.ok) {
      return { ok: false, error: stockRes.error };
    }

    const bestByLego = new Map<
      string,
      {
        inventory: number;
        picture: string | null;
        nameZh: string | null;
        nameEn: string | null;
        gdsColorId: string;
        swatchHex: string | null;
      }
    >();
    for (const r of stockRes.rows) {
      const prev = bestByLego.get(r.legoColorId);
      if (!prev || r.inventory > prev.inventory) {
        bestByLego.set(r.legoColorId, {
          inventory: r.inventory,
          picture: r.picture,
          nameZh: r.colorNameZh,
          nameEn: r.colorNameEn,
          gdsColorId: r.gdsColorId,
          swatchHex: r.swatchHex,
        });
      }
    }

    const legoIds = [...bestByLego.keys()]
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (legoIds.length === 0) {
      return {
        ok: false,
        error: "高砖返回的库存行中无有效 lego_color_id，无法生成选色列表。",
      };
    }

    const db = getCatalogDb();
    const metaRows = await db
      .select({
        id: colors.id,
        name: colors.name,
        rgb: colors.rgb,
        isTrans: colors.isTrans,
      })
      .from(colors)
      .where(inArray(colors.id, legoIds));

    const metaById = new Map(metaRows.map((m) => [m.id, m]));
    const variants: SheetReplaceGobricksStockColor[] = [];

    for (const [legoStr, agg] of bestByLego) {
      const id = Number(legoStr);
      if (!Number.isFinite(id) || id < 0) continue;
      const meta = metaById.get(id);
      const zh = agg.nameZh?.trim() || meta?.name?.trim() || `色号 ${legoStr}`;
      const en = agg.nameEn?.trim() || meta?.name?.trim() || zh;
      const hexGb = agg.swatchHex?.replace(/^#/, "").trim() ?? "";
      const rgb =
        meta?.rgb && /^[0-9a-fA-F]{6}$/.test(meta.rgb)
          ? meta.rgb
          : /^[0-9a-fA-F]{6}$/.test(hexGb)
            ? hexGb
            : "cccccc";
      const name = meta?.name?.trim() || zh;
      const isTrans =
        meta?.isTrans ??
        (zh.includes("透") || en.toLowerCase().includes("trans") || en.toLowerCase().includes("clear"));
      variants.push({
        colorId: id,
        name,
        nameZh: zh,
        nameEn: en,
        rgb,
        isTrans,
        picture: agg.picture,
        inventory: agg.inventory,
        gdsColorId: agg.gdsColorId,
        gdsItemId: `GDS-${productId}-${agg.gdsColorId}`,
      });
    }

    variants.sort((a, b) => b.inventory - a.inventory || a.colorId - b.colorId);

    if (variants.length === 0) {
      return {
        ok: false,
        error:
          stockRes.rows.length > 0
            ? "高砖返回了库存行但无有效乐高色 ID，无法生成选色列表。"
            : "高砖当前未返回该商品有库存的配色。",
      };
    }

    return { ok: true, variants, hint: null, productId };
  } catch {
    return { ok: false, error: "读取高砖有货颜色失败。" };
  }
}
