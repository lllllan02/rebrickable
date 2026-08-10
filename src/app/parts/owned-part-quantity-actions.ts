"use server";

import { and, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildOwnedParts } from "@/db/schema";
import { revalidateOwnedPartsPaths } from "@/lib/build-owned-parts-revalidate";
import { catalogPartExists } from "@/lib/load-favorite-parts";

export type SetOwnedPartColorQuantityResult =
  | { ok: true; quantity: number }
  | { ok: false; error: string };

const MAX_PART_NUM_LEN = 64;
const MAX_QTY = 1_000_000_000;

function normalizeQuantity(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw <= 0) return 0;
  return Math.min(Math.floor(raw), MAX_QTY);
}

/** 按 (partNum, colorId) 设定零件库绝对数量；quantity<=0 删除该行 */
export async function setOwnedPartColorQuantityAction(input: {
  partNum: string;
  colorId: number;
  quantity: number;
}): Promise<SetOwnedPartColorQuantityResult> {
  const partNum = input.partNum.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }
  if (!Number.isInteger(input.colorId) || input.colorId < 0) {
    return { ok: false, error: "颜色无效。" };
  }
  const quantity = normalizeQuantity(input.quantity);
  if (quantity == null) {
    return { ok: false, error: "数量无效。" };
  }

  const exists = await catalogPartExists(partNum);
  if (!exists) {
    return { ok: false, error: "目录中不存在该零件。" };
  }

  try {
    const db = getUserDb();
    const key = and(
      eq(buildOwnedParts.partNum, partNum),
      eq(buildOwnedParts.colorId, input.colorId)
    );

    if (quantity === 0) {
      await db.delete(buildOwnedParts).where(key);
    } else {
      const now = new Date().toISOString();
      await db
        .insert(buildOwnedParts)
        .values({
          partNum,
          colorId: input.colorId,
          quantity,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [buildOwnedParts.partNum, buildOwnedParts.colorId],
          set: {
            quantity,
            updatedAt: now,
          },
        });
    }

    revalidateOwnedPartsPaths([partNum]);
    return { ok: true, quantity };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}
