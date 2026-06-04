import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildReplicatePhases } from "@/db/schema";
import type { ReplicatePhaseRow } from "@/app/mocs/replicate-phase-actions";
import { buildPhaseIoPublicPath, buildPhaseRenderPublicPath } from "@/lib/build-phase-public-path";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";

export async function loadReplicatePhasesForSubject(
  subjectKind: BuildSubjectKind,
  subjectId: string
): Promise<ReplicatePhaseRow[]> {
  if (subjectKind !== BUILD_SUBJECT_MOC) return [];

  const db = getUserDb();
  const rows = await db
    .select({
      id: buildReplicatePhases.id,
      label: buildReplicatePhases.label,
      note: buildReplicatePhases.note,
      sortOrder: buildReplicatePhases.sortOrder,
      renderStoredFile: buildReplicatePhases.renderStoredFile,
      ioStoredFile: buildReplicatePhases.ioStoredFile,
      renderOriginalName: buildReplicatePhases.renderOriginalName,
      ioOriginalName: buildReplicatePhases.ioOriginalName,
      ioByteSize: buildReplicatePhases.ioByteSize,
      createdAt: buildReplicatePhases.createdAt,
      updatedAt: buildReplicatePhases.updatedAt,
    })
    .from(buildReplicatePhases)
    .where(
      and(eq(buildReplicatePhases.subjectKind, subjectKind), eq(buildReplicatePhases.subjectId, subjectId))
    )
    .orderBy(desc(buildReplicatePhases.sortOrder), desc(buildReplicatePhases.id));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    note: r.note,
    sortOrder: r.sortOrder,
    renderUrl: buildPhaseRenderPublicPath(subjectKind, subjectId, r.renderStoredFile),
    ioUrl: buildPhaseIoPublicPath(subjectKind, subjectId, r.ioStoredFile),
    renderOriginalName: r.renderOriginalName,
    ioOriginalName: r.ioOriginalName,
    ioByteSize: r.ioByteSize,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
