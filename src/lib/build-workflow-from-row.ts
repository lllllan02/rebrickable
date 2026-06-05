import type { BuildSubjectKind } from "@/lib/build-subject";
import {
  normalizeWorkflowStage,
  normalizeWorkflowStageForKind,
  type BuildWorkflowStage,
} from "@/lib/build-workflow-stage";
import {
  emptyWorkflowStageTimestamps,
  workflowStageTimestampsFromRow,
  type WorkflowProgressState,
  type WorkflowStageTimestamps,
} from "@/lib/build-workflow-timestamps";

export function workflowStageFromRow(
  row: { workflowStage: string } | undefined,
  subjectKind?: BuildSubjectKind
): BuildWorkflowStage | null {
  if (!row) return null;
  if (subjectKind != null) {
    return normalizeWorkflowStageForKind(row.workflowStage, subjectKind);
  }
  return normalizeWorkflowStage(row.workflowStage);
}

export function workflowProgressFromRow(
  row:
    | {
        workflowStage: string;
        markedAt: string;
        collectedAt: string | null;
        produceAt: string | null;
        replicateAt: string | null;
        purchaseAt: string | null;
        completeAt: string | null;
      }
    | undefined,
  subjectKind?: BuildSubjectKind
): WorkflowProgressState {
  if (!row) {
    return { stage: null, times: emptyWorkflowStageTimestamps() };
  }
  return {
    stage: workflowStageFromRow(row, subjectKind),
    times: workflowStageTimestampsFromRow(row),
  };
}

export type { WorkflowStageTimestamps, WorkflowProgressState };
