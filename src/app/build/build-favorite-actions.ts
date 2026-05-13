"use server";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { buildFavoriteSubjects } from "@/db/schema";
import { revalidateFavoritePaths } from "@/lib/build-favorite-revalidate";
import { isBuildSubjectKind, isSafeBuildSubjectId, type BuildSubjectKind } from "@/lib/build-subject";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

export type SetBuildFavoriteResult = { ok: true } | { ok: false; error: string };

export async function setBuildFavoriteAction(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  favorite: boolean;
}): Promise<SetBuildFavoriteResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isBuildSubjectKind(input.subjectKind) || !isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }

  try {
    const db = getDb();
    if (input.favorite) {
      const markedAt = new Date().toISOString();
      await db
        .insert(buildFavoriteSubjects)
        .values({
          subjectKind: input.subjectKind,
          subjectId,
          markedAt,
        })
        .onConflictDoUpdate({
          target: [buildFavoriteSubjects.subjectKind, buildFavoriteSubjects.subjectId],
          set: { markedAt },
        });
    } else {
      await db
        .delete(buildFavoriteSubjects)
        .where(
          and(
            eq(buildFavoriteSubjects.subjectKind, input.subjectKind),
            eq(buildFavoriteSubjects.subjectId, subjectId)
          )
        );
    }
    revalidateFavoritePaths(input.subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}
