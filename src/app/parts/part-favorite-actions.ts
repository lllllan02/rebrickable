"use server";

import { and, eq, isNotNull, min, ne } from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildFavoriteParts,
  elements,
  inventoryParts,
  partCategories,
  parts,
} from "@/db/schema";
import { revalidateFavoritePartsPaths } from "@/lib/build-favorite-parts-revalidate";
import {
  catalogPartExists,
  isPartFavorite,
} from "@/lib/load-favorite-parts";

export type SetPartFavoriteResult = { ok: true } | { ok: false; error: string };

export type PartFavoriteLookupPreview = {
  partNum: string;
  name: string;
  catName: string | null;
  thumbUrl: string | null;
  alreadyFavorite: boolean;
  /** 若通过 element_id 解析到零件，回显匹配到的 element */
  matchedElementId: string | null;
};

export type LookupPartForFavoriteResult =
  | { ok: true; part: PartFavoriteLookupPreview }
  | { ok: false; error: string };

const MAX_PART_NUM_LEN = 64;

export async function setPartFavoriteAction(input: {
  partNum: string;
  favorite: boolean;
}): Promise<SetPartFavoriteResult> {
  const partNum = input.partNum.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }

  const exists = await catalogPartExists(partNum);
  if (!exists) {
    return { ok: false, error: "目录中不存在该零件。" };
  }

  try {
    const db = getUserDb();
    if (input.favorite) {
      const markedAt = new Date().toISOString();
      await db
        .insert(buildFavoriteParts)
        .values({ partNum, markedAt })
        .onConflictDoUpdate({
          target: buildFavoriteParts.partNum,
          set: { markedAt },
        });
    } else {
      await db
        .delete(buildFavoriteParts)
        .where(eq(buildFavoriteParts.partNum, partNum));
    }
    revalidateFavoritePartsPaths([partNum]);
    return { ok: true };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}

/** 按 part_num 或 element_id 精确查找零件，供收藏页快捷添加预览 */
export async function lookupPartForFavoriteAction(input: {
  query: string;
}): Promise<LookupPartForFavoriteResult> {
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

  const [[row], [thumbRow], alreadyFavorite] = await Promise.all([
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
    isPartFavorite(partNum),
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
      alreadyFavorite,
      matchedElementId,
    },
  };
}
