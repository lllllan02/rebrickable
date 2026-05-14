"use server";

import { getUserDb } from "@/db/client";
import { buildProfiles } from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import { BUILD_SUBJECT_MOC, isSafeBuildSubjectId, type BuildSubjectKind } from "@/lib/build-subject";
import {
  MOC_PROFILE_MAX_DISPLAY_NAME,
  normalizeMocTags,
  serializeTagsJson,
} from "@/lib/moc-profile-parse";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

export type SaveBuildProfileResult = { ok: true } | { ok: false; error: string };

export type SaveMocProfileResult = SaveBuildProfileResult;

export async function saveBuildProfileAction(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  displayName: string;
  tags: unknown;
}): Promise<SaveBuildProfileResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }

  const displayName = String(input.displayName ?? "")
    .trim()
    .slice(0, MOC_PROFILE_MAX_DISPLAY_NAME);

  const rawTags = Array.isArray(input.tags)
    ? input.tags.filter((x): x is string => typeof x === "string")
    : [];
  const tags = normalizeMocTags(rawTags);
  const tagsJson = serializeTagsJson(tags);
  const profileUpdatedAt = new Date().toISOString();

  try {
    const db = getUserDb();
    await db
      .insert(buildProfiles)
      .values({
        subjectKind: input.subjectKind,
        subjectId,
        displayName,
        tagsJson,
        profileUpdatedAt,
      })
      .onConflictDoUpdate({
        target: [buildProfiles.subjectKind, buildProfiles.subjectId],
        set: {
          displayName,
          tagsJson,
          profileUpdatedAt,
        },
      });

    revalidateBuildSubjectPaths(input.subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "保存失败，请重试。" };
  }
}

export async function saveMocProfileAction(input: {
  mocId: string;
  displayName: string;
  tags: unknown;
}): Promise<SaveMocProfileResult> {
  return saveBuildProfileAction({
    subjectKind: BUILD_SUBJECT_MOC,
    subjectId: input.mocId,
    displayName: input.displayName,
    tags: input.tags,
  });
}
