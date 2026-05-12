"use server";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { buildOwnedSubjects } from "@/db/schema";
import { isSafeOwnedSubjectId, OWNED_SUBJECT_PART, type OwnedSubjectKind } from "@/lib/build-owned-subject";
import { revalidateOwnedPaths } from "@/lib/build-owned-revalidate";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

export type SetBuildOwnedResult = { ok: true } | { ok: false; error: string };

const MAX_PART_OWNED_QTY = 1_000_000;

function clampPartOwnedQuantity(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  const x = Math.floor(n);
  if (x < 1) return 1;
  if (x > MAX_PART_OWNED_QTY) return MAX_PART_OWNED_QTY;
  return x;
}

export async function setBuildOwnedAction(input: {
  subjectKind: OwnedSubjectKind;
  subjectId: string;
  owned: boolean;
  /** 仅散装零件（subjectKind=part）且 owned 为 true 时写入；默认 1 */
  quantity?: number;
}): Promise<SetBuildOwnedResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeOwnedSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }

  try {
    const db = getDb();
    if (input.owned) {
      const markedAt = new Date().toISOString();
      const quantity =
        input.subjectKind === OWNED_SUBJECT_PART
          ? clampPartOwnedQuantity(input.quantity ?? 1)
          : 1;
      await db
        .insert(buildOwnedSubjects)
        .values({
          subjectKind: input.subjectKind,
          subjectId,
          markedAt,
          quantity,
        })
        .onConflictDoUpdate({
          target: [buildOwnedSubjects.subjectKind, buildOwnedSubjects.subjectId],
          set:
            input.subjectKind === OWNED_SUBJECT_PART
              ? { markedAt, quantity }
              : { markedAt },
        });
    } else {
      await db
        .delete(buildOwnedSubjects)
        .where(
          and(
            eq(buildOwnedSubjects.subjectKind, input.subjectKind),
            eq(buildOwnedSubjects.subjectId, subjectId)
          )
        );
    }
    revalidateOwnedPaths(input.subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}
