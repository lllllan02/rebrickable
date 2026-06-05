import "server-only";

import { sql } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildOwnedParts } from "@/db/schema";

export type OwnedPartLineInput = {
  partNum: string;
  colorId: number;
  quantity: number;
};

const MAX_QTY = 1_000_000_000;

function safeQty(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_QTY);
}

/** 将若干 (partNum, colorId, quantity) 行累加写入 `build_owned_parts`（同事务内调用） */
export async function mergeOwnedPartLines(lines: readonly OwnedPartLineInput[]): Promise<number> {
  const merged = new Map<string, { partNum: string; colorId: number; quantity: number }>();
  for (const line of lines) {
    const partNum = line.partNum.trim();
    const colorId = line.colorId;
    const q = safeQty(line.quantity);
    if (!partNum || !Number.isFinite(colorId) || q <= 0) continue;
    const key = `${partNum}\0${colorId}`;
    const cur = merged.get(key);
    if (cur) cur.quantity = Math.min(cur.quantity + q, MAX_QTY);
    else merged.set(key, { partNum, colorId, quantity: q });
  }
  if (merged.size === 0) return 0;

  const now = new Date().toISOString();
  const db = getUserDb();
  const values = [...merged.values()].map((v) => ({
    partNum: v.partNum,
    colorId: v.colorId,
    quantity: v.quantity,
    updatedAt: now,
  }));

  await db
    .insert(buildOwnedParts)
    .values(values)
    .onConflictDoUpdate({
      target: [buildOwnedParts.partNum, buildOwnedParts.colorId],
      set: {
        quantity: sql`min(${MAX_QTY}, ${buildOwnedParts.quantity} + excluded.quantity)`,
        updatedAt: now,
      },
    });

  return merged.size;
}
