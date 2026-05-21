"use server";

import { and, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildOwnedSubjects } from "@/db/schema";
import { isSafeOwnedSubjectId } from "@/lib/build-owned-subject";
import { revalidateWorkflowPaths } from "@/lib/build-workflow-revalidate";
import {
  workflowStageTimestampsFromRow,
  workflowStageTimestampDbSet,
  workflowTimestampSetsForStage,
} from "@/lib/build-workflow-timestamps";
import {
  BUILD_WORKFLOW_DEFAULT_STAGE,
  isBuildWorkflowStage,
  normalizeWorkflowStage,
  workflowStageIndex,
  type BuildWorkflowStage,
  type WorkflowSubjectKind,
} from "@/lib/build-workflow-stage";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

export type SetBuildWorkflowResult = { ok: true } | { ok: false; error: string };

export async function setBuildWorkflowStageAction(input: {
  subjectKind: WorkflowSubjectKind;
  subjectId: string;
  stage: BuildWorkflowStage;
}): Promise<SetBuildWorkflowResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeOwnedSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }
  const stage = isBuildWorkflowStage(input.stage) ? input.stage : BUILD_WORKFLOW_DEFAULT_STAGE;

  try {
    const db = getUserDb();
    const key = and(
      eq(buildOwnedSubjects.subjectKind, input.subjectKind),
      eq(buildOwnedSubjects.subjectId, subjectId)
    );
    const [existing] = await db.select().from(buildOwnedSubjects).where(key).limit(1);
    const markedAt = new Date().toISOString();
    const tsSets = workflowTimestampSetsForStage(
      stage,
      markedAt,
      existing ? workflowStageTimestampsFromRow(existing) : null
    );

    await db
      .insert(buildOwnedSubjects)
      .values({
        subjectKind: input.subjectKind,
        subjectId,
        workflowStage: stage,
        markedAt,
        collectedAt: tsSets.collectedAt ?? null,
        replicateAt: tsSets.replicateAt ?? null,
        purchaseAt: tsSets.purchaseAt ?? null,
        completeAt: tsSets.completeAt ?? null,
      })
      .onConflictDoUpdate({
        target: [buildOwnedSubjects.subjectKind, buildOwnedSubjects.subjectId],
        set: {
          workflowStage: stage,
          markedAt,
          ...tsSets,
        },
      });
    revalidateWorkflowPaths(input.subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}

/** 将某一阶段的时间戳更新为当前时刻（不改变当前阶段，除非尚无记录） */
export async function setBuildWorkflowStageTimestampAction(input: {
  subjectKind: WorkflowSubjectKind;
  subjectId: string;
  stage: BuildWorkflowStage;
}): Promise<SetBuildWorkflowResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeOwnedSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }
  if (!isBuildWorkflowStage(input.stage)) {
    return { ok: false, error: "阶段无效。" };
  }
  if (input.stage === "collected") {
    return { ok: false, error: "收录时间不可修改。" };
  }
  const stage = input.stage;

  try {
    const db = getUserDb();
    const key = and(
      eq(buildOwnedSubjects.subjectKind, input.subjectKind),
      eq(buildOwnedSubjects.subjectId, subjectId)
    );
    const [existing] = await db.select().from(buildOwnedSubjects).where(key).limit(1);
    const markedAt = new Date().toISOString();
    const timePatch = workflowStageTimestampDbSet(stage, markedAt);

    if (existing) {
      const currentStage = normalizeWorkflowStage(existing.workflowStage) ?? BUILD_WORKFLOW_DEFAULT_STAGE;
      if (workflowStageIndex(stage) > workflowStageIndex(currentStage)) {
        return { ok: false, error: "尚未到达该阶段，无法更新时间。" };
      }
      await db
        .update(buildOwnedSubjects)
        .set({ markedAt, ...timePatch })
        .where(key);
    } else {
      const tsSets = workflowTimestampSetsForStage(stage, markedAt, null);
      await db.insert(buildOwnedSubjects).values({
        subjectKind: input.subjectKind,
        subjectId,
        workflowStage: stage,
        markedAt,
        collectedAt: tsSets.collectedAt ?? timePatch.collectedAt ?? null,
        replicateAt: tsSets.replicateAt ?? timePatch.replicateAt ?? null,
        purchaseAt: tsSets.purchaseAt ?? timePatch.purchaseAt ?? null,
        completeAt: tsSets.completeAt ?? timePatch.completeAt ?? null,
      });
    }

    revalidateWorkflowPaths(input.subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "更新时间失败，请重试。" };
  }
}
