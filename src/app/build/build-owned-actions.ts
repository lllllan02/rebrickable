"use server";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { buildOwnedSubjects } from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import { isSafeBuildSubjectId, type BuildSubjectKind } from "@/lib/build-subject";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

export type SetBuildOwnedResult = { ok: true } | { ok: false; error: string };

export async function setBuildOwnedAction(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  owned: boolean;
}): Promise<SetBuildOwnedResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }

  try {
    const db = getDb();
    if (input.owned) {
      const markedAt = new Date().toISOString();
      await db
        .insert(buildOwnedSubjects)
        .values({
          subjectKind: input.subjectKind,
          subjectId,
          markedAt,
        })
        .onConflictDoUpdate({
          target: [buildOwnedSubjects.subjectKind, buildOwnedSubjects.subjectId],
          set: { markedAt },
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
    revalidateBuildSubjectPaths(input.subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}
