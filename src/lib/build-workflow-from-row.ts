import { normalizeWorkflowStage, type BuildWorkflowStage } from "@/lib/build-workflow-stage";
import {
  emptyWorkflowStageTimestamps,
  workflowStageTimestampsFromRow,
  type WorkflowProgressState,
  type WorkflowStageTimestamps,
} from "@/lib/build-workflow-timestamps";

export function workflowStageFromRow(
  row: { workflowStage: string } | undefined
): BuildWorkflowStage | null {
  if (!row) return null;
  return normalizeWorkflowStage(row.workflowStage);
}

export function workflowProgressFromRow(
  row:
    | {
        workflowStage: string;
        markedAt: string;
        collectedAt: string | null;
        replicateAt: string | null;
        purchaseAt: string | null;
        completeAt: string | null;
      }
    | undefined
): WorkflowProgressState {
  if (!row) {
    return { stage: null, times: emptyWorkflowStageTimestamps() };
  }
  return {
    stage: workflowStageFromRow(row),
    times: workflowStageTimestampsFromRow(row),
  };
}

export type { WorkflowStageTimestamps, WorkflowProgressState };
