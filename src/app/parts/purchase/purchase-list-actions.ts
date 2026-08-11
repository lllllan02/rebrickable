"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildPurchaseListItems } from "@/db/schema";
import { revalidatePurchaseListPaths } from "@/lib/build-purchase-list-revalidate";
import { revalidateOwnedPartsPaths } from "@/lib/build-owned-parts-revalidate";
import { catalogPartExists } from "@/lib/load-favorite-parts";
import { loadPurchaseListPartNums } from "@/lib/load-purchase-list";
import { mergeOwnedPartLines } from "@/lib/merge-owned-parts";

export type PurchaseListActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type SetPurchaseQuantityResult =
  | { ok: true; quantity: number }
  | { ok: false; error: string };

export type TransferPurchaseResult =
  | { ok: true; transferred: number }
  | { ok: false; error: string };

const MAX_PART_NUM_LEN = 64;
const MAX_QTY = 1_000_000_000;

function normalizeQuantity(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  if (raw === 0) return 0;
  return Math.min(Math.floor(raw), MAX_QTY);
}

async function ensurePlaceholderIfEmpty(partNum: string): Promise<void> {
  const db = getUserDb();
  const [any] = await db
    .select({ id: buildPurchaseListItems.id })
    .from(buildPurchaseListItems)
    .where(eq(buildPurchaseListItems.partNum, partNum))
    .limit(1);
  if (any) return;
  const now = new Date().toISOString();
  await db.insert(buildPurchaseListItems).values({
    partNum,
    colorId: null,
    quantity: 0,
    addedAt: now,
    updatedAt: now,
  });
}

/** 按零件号加入购买清单；无色占位 quantity=0；已存在任意行则 noop */
export async function addPartToPurchaseListAction(input: {
  partNum: string;
}): Promise<PurchaseListActionResult> {
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
    const [existing] = await db
      .select({ id: buildPurchaseListItems.id })
      .from(buildPurchaseListItems)
      .where(eq(buildPurchaseListItems.partNum, partNum))
      .limit(1);
    if (existing) {
      return { ok: true };
    }

    const now = new Date().toISOString();
    await db.insert(buildPurchaseListItems).values({
      partNum,
      colorId: null,
      quantity: 0,
      addedAt: now,
      updatedAt: now,
    });
    revalidatePurchaseListPaths([partNum]);
    return { ok: true };
  } catch {
    return { ok: false, error: "加入失败，请重试。" };
  }
}

/** 从购买清单移除（按零件号，删除该零件全部行） */
export async function removePartFromPurchaseListAction(input: {
  partNum: string;
}): Promise<PurchaseListActionResult> {
  const partNum = input.partNum.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }

  try {
    const db = getUserDb();
    await db
      .delete(buildPurchaseListItems)
      .where(eq(buildPurchaseListItems.partNum, partNum));
    revalidatePurchaseListPaths([partNum]);
    return { ok: true };
  } catch {
    return { ok: false, error: "移除失败，请重试。" };
  }
}

/**
 * 按颜色设定待购数量（详情页）。
 * quantity>0：upsert 有色行，并删除无色占位；
 * quantity<=0：删除该色行，若零件再无行则恢复无色占位。
 */
export async function setPurchaseListColorQuantityAction(input: {
  partNum: string;
  colorId: number;
  quantity: number;
}): Promise<SetPurchaseQuantityResult> {
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
    const now = new Date().toISOString();
    const colorKey = and(
      eq(buildPurchaseListItems.partNum, partNum),
      eq(buildPurchaseListItems.colorId, input.colorId)
    );

    if (quantity === 0) {
      await db.delete(buildPurchaseListItems).where(colorKey);
      await ensurePlaceholderIfEmpty(partNum);
      revalidatePurchaseListPaths([partNum]);
      return { ok: true, quantity: 0 };
    }

    const [existing] = await db
      .select({ id: buildPurchaseListItems.id })
      .from(buildPurchaseListItems)
      .where(colorKey)
      .limit(1);

    if (existing) {
      await db
        .update(buildPurchaseListItems)
        .set({ quantity, updatedAt: now })
        .where(eq(buildPurchaseListItems.id, existing.id));
    } else {
      await db.insert(buildPurchaseListItems).values({
        partNum,
        colorId: input.colorId,
        quantity,
        addedAt: now,
        updatedAt: now,
      });
    }

    // 有色行出现后去掉无色占位
    await db
      .delete(buildPurchaseListItems)
      .where(
        and(
          eq(buildPurchaseListItems.partNum, partNum),
          isNull(buildPurchaseListItems.colorId)
        )
      );

    revalidatePurchaseListPaths([partNum]);
    return { ok: true, quantity };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}

export async function loadPurchaseListPartNumsAction(input: {
  partNums: string[];
}): Promise<{ ok: true; partNums: string[] } | { ok: false; error: string }> {
  try {
    const set = await loadPurchaseListPartNums(input.partNums);
    return { ok: true, partNums: [...set] };
  } catch {
    return { ok: false, error: "查询失败。" };
  }
}

/**
 * 将选中行转入零件库。无色或数量≤0 的行拒绝。
 * 成功后删除对应清单行；若某零件再无行则恢复无色占位。
 */
export async function transferPurchaseListToOwnedAction(input: {
  itemIds: number[];
}): Promise<TransferPurchaseResult> {
  const ids = [
    ...new Set(input.itemIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (ids.length === 0) {
    return { ok: false, error: "请先选择要转入的行。" };
  }

  try {
    const db = getUserDb();
    const rows = await db
      .select({
        id: buildPurchaseListItems.id,
        partNum: buildPurchaseListItems.partNum,
        colorId: buildPurchaseListItems.colorId,
        quantity: buildPurchaseListItems.quantity,
      })
      .from(buildPurchaseListItems)
      .where(inArray(buildPurchaseListItems.id, ids));

    if (rows.length === 0) {
      return { ok: false, error: "所选行不存在。" };
    }

    const missing = rows.filter((r) => r.colorId == null);
    if (missing.length > 0) {
      return {
        ok: false,
        error: `有 ${missing.length} 行未选颜色，转入零件库前必须选择颜色。`,
      };
    }

    const invalidQty = rows.filter((r) => r.quantity <= 0);
    if (invalidQty.length > 0) {
      return { ok: false, error: "存在数量无效的行，请先填写数量。" };
    }

    const lines = rows.map((r) => ({
      partNum: r.partNum,
      colorId: r.colorId as number,
      quantity: r.quantity,
    }));

    await mergeOwnedPartLines(lines);

    const transferredIds = rows.map((r) => r.id);
    await db
      .delete(buildPurchaseListItems)
      .where(inArray(buildPurchaseListItems.id, transferredIds));

    const partNums = [...new Set(rows.map((r) => r.partNum))];
    for (const pn of partNums) {
      await ensurePlaceholderIfEmpty(pn);
    }

    revalidatePurchaseListPaths(partNums);
    revalidateOwnedPartsPaths(partNums);
    return { ok: true, transferred: rows.length };
  } catch {
    return { ok: false, error: "转入失败，请重试。" };
  }
}

/** 详情页：按零件+颜色转入零件库 */
export async function transferPurchaseColorToOwnedAction(input: {
  partNum: string;
  colorId: number;
}): Promise<TransferPurchaseResult> {
  const partNum = input.partNum.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }
  if (!Number.isInteger(input.colorId) || input.colorId < 0) {
    return { ok: false, error: "颜色无效。" };
  }

  try {
    const db = getUserDb();
    const [row] = await db
      .select({
        id: buildPurchaseListItems.id,
        partNum: buildPurchaseListItems.partNum,
        colorId: buildPurchaseListItems.colorId,
        quantity: buildPurchaseListItems.quantity,
      })
      .from(buildPurchaseListItems)
      .where(
        and(
          eq(buildPurchaseListItems.partNum, partNum),
          eq(buildPurchaseListItems.colorId, input.colorId)
        )
      )
      .limit(1);

    if (!row || row.colorId == null) {
      return { ok: false, error: "该颜色不在购买清单中。" };
    }
    if (row.quantity <= 0) {
      return { ok: false, error: "待购数量无效。" };
    }

    return transferPurchaseListToOwnedAction({ itemIds: [row.id] });
  } catch {
    return { ok: false, error: "转入失败，请重试。" };
  }
}
