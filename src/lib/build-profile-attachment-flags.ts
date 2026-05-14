import { and, eq } from "drizzle-orm";

import type { UserDb } from "@/db/client";
import { buildAttachments, buildProfiles } from "@/db/schema";
import type { BuildSubjectKind } from "@/lib/build-subject";
import { serializeTagsJson } from "@/lib/moc-profile-parse";

/** 根据 `build_attachments` 重算并写入 `build_profiles` 的冗余角标字段（列表不查附件表）。 */
export async function refreshBuildProfileAttachmentFlags(
  db: UserDb,
  subjectKind: BuildSubjectKind,
  subjectId: string
): Promise<void> {
  const rows = await db
    .select({ storedFile: buildAttachments.storedFile })
    .from(buildAttachments)
    .where(and(eq(buildAttachments.subjectKind, subjectKind), eq(buildAttachments.subjectId, subjectId)));

  let hasInstructionsPdf = false;
  let hasIoSource = false;
  for (const r of rows) {
    const s = r.storedFile.toLowerCase();
    if (s.endsWith(".pdf")) hasInstructionsPdf = true;
    if (s.endsWith(".io")) hasIoSource = true;
  }

  const profileUpdatedAt = new Date().toISOString();
  await db
    .insert(buildProfiles)
    .values({
      subjectKind,
      subjectId,
      displayName: "",
      tagsJson: serializeTagsJson([]),
      profileUpdatedAt,
      hasInstructionsPdf,
      hasIoSource,
    })
    .onConflictDoUpdate({
      target: [buildProfiles.subjectKind, buildProfiles.subjectId],
      set: {
        hasInstructionsPdf,
        hasIoSource,
      },
    });
}
