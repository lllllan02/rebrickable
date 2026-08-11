"use server";

import { and, eq, isNotNull, isNull, min, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildFavoriteParts,
  buildOwnedParts,
  buildPurchaseListItems,
  elements,
  inventoryParts,
  partCategories,
  parts,
} from "@/db/schema";
import { revalidateFavoritePartsPaths } from "@/lib/build-favorite-parts-revalidate";
import { revalidateOwnedPartsPaths } from "@/lib/build-owned-parts-revalidate";
import { revalidatePurchaseListPaths } from "@/lib/build-purchase-list-revalidate";
import { isPartFavorite } from "@/lib/load-favorite-parts";
import { mergeOwnedPartLines } from "@/lib/merge-owned-parts";
import {
  clearPartUpgrade,
  resolveLatestPartNum,
  setPartUpgrade,
  type PartUpgradeMutationResult,
} from "@/lib/part-upgrades";

const MAX_PART_NUM_LEN = 64;
const MAX_QTY = 1_000_000_000;

export type PartUpgradeLookupPreview = {
  partNum: string;
  name: string;
  catName: string | null;
  thumbUrl: string | null;
  matchedElementId: string | null;
};

export type LookupPartForUpgradeResult =
  | { ok: true; part: PartUpgradeLookupPreview }
  | { ok: false; error: string };

export type ReplacePartScope = "favorites" | "owned" | "purchase";

export type ReplacePartWithLatestResult =
  | { ok: true; fromPartNum: string; toPartNum: string }
  | { ok: false; error: string };

function revalidateUpgradePaths(partNums: readonly string[]) {
  revalidatePath("/parts");
  revalidatePath("/parts/favorites");
  revalidatePath("/parts/owned");
  revalidatePath("/parts/purchase");
  revalidatePath("/search");
  for (const partNum of partNums) {
    if (!partNum.trim()) continue;
    revalidatePath(`/parts/${encodeURIComponent(partNum.trim())}`);
  }
}

export async function setPartUpgradeAction(input: {
  fromPartNum: string;
  toPartNum: string;
  note?: string | null;
}): Promise<PartUpgradeMutationResult> {
  const result = await setPartUpgrade(
    input.fromPartNum,
    input.toPartNum,
    input.note
  );
  if (result.ok) {
    revalidateUpgradePaths([input.fromPartNum, input.toPartNum]);
  }
  return result;
}

export async function clearPartUpgradeAction(input: {
  fromPartNum: string;
}): Promise<PartUpgradeMutationResult> {
  const from = input.fromPartNum.trim();
  const result = await clearPartUpgrade(from);
  if (result.ok) {
    revalidateUpgradePaths([from]);
  }
  return result;
}

/** 按 part_num 或 element_id 精确查找，供详情页设定升级目标 */
export async function lookupPartForUpgradeAction(input: {
  query: string;
}): Promise<LookupPartForUpgradeResult> {
  const query = input.query.trim();
  if (!query || query.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "请输入有效的零件号或 element_id。" };
  }

  const catalogDb = getCatalogDb();

  let partNum: string | null = null;
  let matchedElementId: string | null = null;

  const [byPart] = await catalogDb
    .select({ partNum: parts.partNum })
    .from(parts)
    .where(eq(parts.partNum, query))
    .limit(1);

  if (byPart) {
    partNum = byPart.partNum;
  } else {
    const [byElement] = await catalogDb
      .select({ partNum: elements.partNum, elementId: elements.elementId })
      .from(elements)
      .where(eq(elements.elementId, query))
      .limit(1);
    if (byElement) {
      partNum = byElement.partNum;
      matchedElementId = byElement.elementId;
    }
  }

  if (!partNum) {
    return { ok: false, error: "未找到该编号对应的零件。" };
  }

  const imgClause = and(
    eq(inventoryParts.partNum, partNum),
    isNotNull(inventoryParts.imgUrl),
    ne(inventoryParts.imgUrl, "")
  );

  const [[row], [thumbRow]] = await Promise.all([
    catalogDb
      .select({
        partNum: parts.partNum,
        name: parts.name,
        catName: partCategories.name,
      })
      .from(parts)
      .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
      .where(eq(parts.partNum, partNum))
      .limit(1),
    catalogDb
      .select({ thumb: min(inventoryParts.imgUrl) })
      .from(inventoryParts)
      .where(imgClause),
  ]);

  if (!row) {
    return { ok: false, error: "未找到该编号对应的零件。" };
  }

  return {
    ok: true,
    part: {
      partNum: row.partNum,
      name: row.name,
      catName: row.catName ?? null,
      thumbUrl: thumbRow?.thumb?.trim() || null,
      matchedElementId,
    },
  };
}

async function replaceInFavorites(
  fromPartNum: string,
  toPartNum: string
): Promise<ReplacePartWithLatestResult> {
  const db = getUserDb();
  const favorited = await isPartFavorite(fromPartNum);
  if (!favorited) {
    return { ok: false, error: "收藏中没有该零件。" };
  }

  const markedAt = new Date().toISOString();
  await db
    .delete(buildFavoriteParts)
    .where(eq(buildFavoriteParts.partNum, fromPartNum));

  const already = await isPartFavorite(toPartNum);
  if (!already) {
    await db.insert(buildFavoriteParts).values({
      partNum: toPartNum,
      markedAt,
    });
  }

  revalidateFavoritePartsPaths([fromPartNum, toPartNum]);
  return { ok: true, fromPartNum, toPartNum };
}

async function replaceInOwned(
  fromPartNum: string,
  toPartNum: string
): Promise<ReplacePartWithLatestResult> {
  const db = getUserDb();
  const rows = await db
    .select({
      colorId: buildOwnedParts.colorId,
      quantity: buildOwnedParts.quantity,
    })
    .from(buildOwnedParts)
    .where(eq(buildOwnedParts.partNum, fromPartNum));

  if (rows.length === 0) {
    return { ok: false, error: "零件库中没有该零件。" };
  }

  await mergeOwnedPartLines(
    rows.map((r) => ({
      partNum: toPartNum,
      colorId: r.colorId,
      quantity: r.quantity,
    }))
  );

  await db
    .delete(buildOwnedParts)
    .where(eq(buildOwnedParts.partNum, fromPartNum));

  revalidateOwnedPartsPaths([fromPartNum, toPartNum]);
  return { ok: true, fromPartNum, toPartNum };
}

async function replaceInPurchase(
  fromPartNum: string,
  toPartNum: string
): Promise<ReplacePartWithLatestResult> {
  const db = getUserDb();
  const rows = await db
    .select({
      id: buildPurchaseListItems.id,
      colorId: buildPurchaseListItems.colorId,
      quantity: buildPurchaseListItems.quantity,
      addedAt: buildPurchaseListItems.addedAt,
    })
    .from(buildPurchaseListItems)
    .where(eq(buildPurchaseListItems.partNum, fromPartNum));

  if (rows.length === 0) {
    return { ok: false, error: "购买清单中没有该零件。" };
  }

  const now = new Date().toISOString();
  // 按 colorId（含 null）汇总旧件数量
  const byColor = new Map<number | null, { quantity: number; addedAt: string }>();
  for (const r of rows) {
    const key = r.colorId;
    const cur = byColor.get(key);
    const qty = Math.min(Math.max(0, r.quantity), MAX_QTY);
    if (cur) {
      cur.quantity = Math.min(cur.quantity + qty, MAX_QTY);
      if (r.addedAt < cur.addedAt) cur.addedAt = r.addedAt;
    } else {
      byColor.set(key, { quantity: qty, addedAt: r.addedAt });
    }
  }

  for (const [colorId, agg] of byColor) {
    const colorKey =
      colorId == null
        ? and(
            eq(buildPurchaseListItems.partNum, toPartNum),
            isNull(buildPurchaseListItems.colorId)
          )
        : and(
            eq(buildPurchaseListItems.partNum, toPartNum),
            eq(buildPurchaseListItems.colorId, colorId)
          );

    const [existing] = await db
      .select({
        id: buildPurchaseListItems.id,
        quantity: buildPurchaseListItems.quantity,
      })
      .from(buildPurchaseListItems)
      .where(colorKey)
      .limit(1);

    if (existing) {
      await db
        .update(buildPurchaseListItems)
        .set({
          quantity: Math.min(existing.quantity + agg.quantity, MAX_QTY),
          updatedAt: now,
        })
        .where(eq(buildPurchaseListItems.id, existing.id));
    } else {
      await db.insert(buildPurchaseListItems).values({
        partNum: toPartNum,
        colorId,
        quantity: agg.quantity,
        addedAt: agg.addedAt,
        updatedAt: now,
      });
    }
  }

  const targetRows = await db
    .select({
      id: buildPurchaseListItems.id,
      colorId: buildPurchaseListItems.colorId,
    })
    .from(buildPurchaseListItems)
    .where(eq(buildPurchaseListItems.partNum, toPartNum));
  const hasColored = targetRows.some((r) => r.colorId != null);
  if (hasColored) {
    await db
      .delete(buildPurchaseListItems)
      .where(
        and(
          eq(buildPurchaseListItems.partNum, toPartNum),
          isNull(buildPurchaseListItems.colorId)
        )
      );
  }

  await db
    .delete(buildPurchaseListItems)
    .where(eq(buildPurchaseListItems.partNum, fromPartNum));

  revalidatePurchaseListPaths([fromPartNum, toPartNum]);
  return { ok: true, fromPartNum, toPartNum };
}

/** 在指定列表内将零件一键替换为升级链路终点 */
export async function replacePartWithLatestInScopeAction(input: {
  partNum: string;
  scope: ReplacePartScope;
}): Promise<ReplacePartWithLatestResult> {
  const partNum = input.partNum.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }
  if (
    input.scope !== "favorites" &&
    input.scope !== "owned" &&
    input.scope !== "purchase"
  ) {
    return { ok: false, error: "无效的替换范围。" };
  }

  const latest = await resolveLatestPartNum(partNum);
  if (latest === partNum) {
    return { ok: false, error: "该零件没有升级替代。" };
  }

  try {
    if (input.scope === "favorites") {
      return await replaceInFavorites(partNum, latest);
    }
    if (input.scope === "owned") {
      return await replaceInOwned(partNum, latest);
    }
    return await replaceInPurchase(partNum, latest);
  } catch {
    return { ok: false, error: "替换失败，请重试。" };
  }
}
