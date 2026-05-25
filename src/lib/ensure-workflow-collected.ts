import "server-only";

import { and, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildOwnedSubjects } from "@/db/schema";
import { isSafeOwnedSubjectId } from "@/lib/build-owned-subject";
import { workflowProgressFromRow, type WorkflowProgressState } from "@/lib/build-workflow-from-row";
import {
  BUILD_WORKFLOW_DEFAULT_STAGE,
  type WorkflowSubjectKind,
} from "@/lib/build-workflow-stage";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

/** 只读加载拼搭进度，不写入数据库。 */
export async function loadWorkflowProgress(
  subjectKind: WorkflowSubjectKind,
  subjectId: string
): Promise<WorkflowProgressState> {
  const id = subjectId.trim();
  if (!id || id.length > BUILD_UPLOAD_MAX_ID_LEN || !isSafeOwnedSubjectId(subjectKind, id)) {
    return workflowProgressFromRow(undefined);
  }

  const db = getUserDb();
  const key = and(eq(buildOwnedSubjects.subjectKind, subjectKind), eq(buildOwnedSubjects.subjectId, id));
  const [existing] = await db.select().from(buildOwnedSubjects).where(key).limit(1);
  return workflowProgressFromRow(existing, subjectKind);
}

/** 尚无进度记录时写入「收录」；已有记录则原样返回（不降级阶段） */
export async function ensureWorkflowCollected(
  subjectKind: WorkflowSubjectKind,
  subjectId: string
): Promise<WorkflowProgressState> {
  const id = subjectId.trim();
  if (!id || id.length > BUILD_UPLOAD_MAX_ID_LEN || !isSafeOwnedSubjectId(subjectKind, id)) {
    return workflowProgressFromRow(undefined);
  }

  const db = getUserDb();
  const key = and(eq(buildOwnedSubjects.subjectKind, subjectKind), eq(buildOwnedSubjects.subjectId, id));
  const [existing] = await db.select().from(buildOwnedSubjects).where(key).limit(1);
  if (existing) {
    return workflowProgressFromRow(existing, subjectKind);
  }

  const now = new Date().toISOString();
  await db
    .insert(buildOwnedSubjects)
    .values({
      subjectKind,
      subjectId: id,
      workflowStage: BUILD_WORKFLOW_DEFAULT_STAGE,
      markedAt: now,
      collectedAt: now,
      replicateAt: null,
      purchaseAt: null,
      completeAt: null,
    })
    .onConflictDoNothing();

  const rows = await db.select().from(buildOwnedSubjects).where(key).limit(1);
  return workflowProgressFromRow(rows[0], subjectKind);
}
