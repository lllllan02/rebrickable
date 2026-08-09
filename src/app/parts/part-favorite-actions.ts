"use server";

import { eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildFavoriteParts } from "@/db/schema";
import { revalidateFavoritePartsPaths } from "@/lib/build-favorite-parts-revalidate";
import { catalogPartExists } from "@/lib/load-favorite-parts";

export type SetPartFavoriteResult = { ok: true } | { ok: false; error: string };

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
