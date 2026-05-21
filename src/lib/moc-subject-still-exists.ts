import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { UserDb } from "@/db/client";
import {
  buildAttachments,
  buildImages,
  buildProfiles,
  buildSavedPartsSheets,
} from "@/db/schema";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

/** MOC 是否仍有本地用户数据（资料、零件表、图或附件）。用于过滤已删 MOC 残留的进度行。 */
export async function mocSubjectIdsWithUserData(
  db: UserDb,
  subjectIds: string[]
): Promise<Set<string>> {
  if (subjectIds.length === 0) return new Set();

  const kind = BUILD_SUBJECT_MOC;
  const keyFilter = and(eq(buildProfiles.subjectKind, kind), inArray(buildProfiles.subjectId, subjectIds));

  const [profRows, sheetRows, imgRows, attRows] = await Promise.all([
    db.select({ subjectId: buildProfiles.subjectId }).from(buildProfiles).where(keyFilter),
    db
      .select({ subjectId: buildSavedPartsSheets.subjectId })
      .from(buildSavedPartsSheets)
      .where(and(eq(buildSavedPartsSheets.subjectKind, kind), inArray(buildSavedPartsSheets.subjectId, subjectIds))),
    db
      .select({ subjectId: buildImages.subjectId })
      .from(buildImages)
      .where(and(eq(buildImages.subjectKind, kind), inArray(buildImages.subjectId, subjectIds))),
    db
      .select({ subjectId: buildAttachments.subjectId })
      .from(buildAttachments)
      .where(and(eq(buildAttachments.subjectKind, kind), inArray(buildAttachments.subjectId, subjectIds))),
  ]);

  const out = new Set<string>();
  for (const r of profRows) out.add(r.subjectId);
  for (const r of sheetRows) out.add(r.subjectId);
  for (const r of imgRows) out.add(r.subjectId);
  for (const r of attRows) out.add(r.subjectId);
  return out;
}
