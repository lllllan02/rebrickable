"use server";

import fs from "fs/promises";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getUserDb } from "@/db/client";
import {
  buildAttachments,
  buildFavoriteSubjects,
  buildImages,
  buildIoStepBatches,
  buildOwnedSubjects,
  buildProfiles,
  buildSavedPartsSheets,
} from "@/db/schema";
import { buildSubjectDetailPath, buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, isSafeBuildSubjectId, type BuildSubjectKind } from "@/lib/build-subject";
import { buildUploadAbsoluteDir, BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

function subjectKey(kind: BuildSubjectKind, subjectId: string) {
  return { kind, id: subjectId };
}

function revalidateAfterBuildSubjectDelete(kind: BuildSubjectKind, subjectId: string): void {
  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath(buildSubjectListPath(kind));
  revalidatePath(buildSubjectDetailPath(kind, subjectId));
}

/** 删除本地 MOC 及其全部用户数据（零件表、资料、图、附件、拥有/收藏标记与上传目录）。 */
export async function deleteBuildSubjectAction(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (subjectKind !== BUILD_SUBJECT_MOC) {
    return { ok: false, error: "仅支持删除 MOC。" };
  }

  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) {
    return { ok: false, error: "MOC ID 含有非法字符。" };
  }

  const key = subjectKey(subjectKind, subjectId);

  try {
    const db = getUserDb();
    db.transaction((tx) => {
      tx.delete(buildSavedPartsSheets)
        .where(and(eq(buildSavedPartsSheets.subjectKind, key.kind), eq(buildSavedPartsSheets.subjectId, key.id)))
        .run();
      tx.delete(buildProfiles)
        .where(and(eq(buildProfiles.subjectKind, key.kind), eq(buildProfiles.subjectId, key.id)))
        .run();
      tx.delete(buildImages)
        .where(and(eq(buildImages.subjectKind, key.kind), eq(buildImages.subjectId, key.id)))
        .run();
      tx.delete(buildAttachments)
        .where(and(eq(buildAttachments.subjectKind, key.kind), eq(buildAttachments.subjectId, key.id)))
        .run();
      tx.delete(buildIoStepBatches)
        .where(and(eq(buildIoStepBatches.subjectKind, key.kind), eq(buildIoStepBatches.subjectId, key.id)))
        .run();
      tx.delete(buildOwnedSubjects)
        .where(and(eq(buildOwnedSubjects.subjectKind, key.kind), eq(buildOwnedSubjects.subjectId, key.id)))
        .run();
      tx.delete(buildFavoriteSubjects)
        .where(and(eq(buildFavoriteSubjects.subjectKind, key.kind), eq(buildFavoriteSubjects.subjectId, key.id)))
        .run();
    });

    await fs.rm(buildUploadAbsoluteDir(subjectKind, subjectId), { recursive: true, force: true }).catch(() => {});

    revalidateAfterBuildSubjectDelete(subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}

export async function deleteMocAction(
  mocIdRaw: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteBuildSubjectAction(BUILD_SUBJECT_MOC, mocIdRaw);
}
