"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { mocProfiles } from "@/db/schema";
import {
  MOC_PROFILE_MAX_DISPLAY_NAME,
  normalizeMocTags,
  serializeTagsJson,
} from "@/lib/moc-profile-parse";
import { MOC_UPLOAD_MAX_ID_LEN } from "@/lib/moc-upload-storage";

export type SaveMocProfileResult = { ok: true } | { ok: false; error: string };

export async function saveMocProfileAction(input: {
  mocId: string;
  displayName: string;
  tags: unknown;
}): Promise<SaveMocProfileResult> {
  const mocId = input.mocId.trim();
  if (!mocId || mocId.length > MOC_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "MOC ID 无效。" };
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
    const db = getDb();
    await db
      .insert(mocProfiles)
      .values({
        mocId,
        displayName,
        tagsJson,
        profileUpdatedAt,
      })
      .onConflictDoUpdate({
        target: mocProfiles.mocId,
        set: {
          displayName,
          tagsJson,
          profileUpdatedAt,
        },
      });

    revalidatePath("/mocs");
    revalidatePath(`/mocs/${mocId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "保存失败，请重试。" };
  }
}
