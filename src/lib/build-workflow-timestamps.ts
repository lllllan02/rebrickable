import type { BuildSubjectKind } from "@/lib/build-subject";
import {
  workflowStagesForKind,
  type BuildWorkflowStage,
} from "@/lib/build-workflow-stage";

export type WorkflowStageTimestamps = Record<BuildWorkflowStage, string | null>;

export type WorkflowProgressState = {
  stage: BuildWorkflowStage | null;
  times: WorkflowStageTimestamps;
};

const STAGE_AT_KEYS = {
  collected: "collectedAt",
  replicate: "replicateAt",
  purchase: "purchaseAt",
  complete: "completeAt",
} as const satisfies Record<BuildWorkflowStage, keyof WorkflowRowShape>;

export type WorkflowStageTimestampDbSet = {
  collectedAt?: string;
  replicateAt?: string;
  purchaseAt?: string;
  completeAt?: string;
};

/** 仅更新某一阶段的时间戳字段（供 Drizzle `set` 使用） */
export function workflowStageTimestampDbSet(
  stage: BuildWorkflowStage,
  at: string
): WorkflowStageTimestampDbSet {
  return { [STAGE_AT_KEYS[stage]]: at };
}

type WorkflowRowShape = {
  workflowStage: string;
  markedAt: string;
  collectedAt: string | null;
  replicateAt: string | null;
  purchaseAt: string | null;
  completeAt: string | null;
};

export function emptyWorkflowStageTimestamps(): WorkflowStageTimestamps {
  return {
    collected: null,
    replicate: null,
    purchase: null,
    complete: null,
  };
}

export function workflowStageTimestampsFromRow(
  row: WorkflowRowShape | undefined
): WorkflowStageTimestamps {
  if (!row) return emptyWorkflowStageTimestamps();
  return {
    collected: row.collectedAt ?? null,
    replicate: row.replicateAt ?? null,
    purchase: row.purchaseAt ?? null,
    complete: row.completeAt ?? null,
  };
}

/** 进入 `stage` 时补全该阶段及之前各阶段的首次时间戳 */
export function workflowTimestampSetsForStage(
  stage: BuildWorkflowStage,
  now: string,
  existing: WorkflowStageTimestamps | null,
  subjectKind?: BuildSubjectKind
): {
  collectedAt?: string;
  replicateAt?: string;
  purchaseAt?: string;
  completeAt?: string;
} {
  const prev = existing ?? emptyWorkflowStageTimestamps();
  const stages = workflowStagesForKind(subjectKind ?? "moc");
  const idx = stages.indexOf(stage);
  const out: {
    collectedAt?: string;
    replicateAt?: string;
    purchaseAt?: string;
    completeAt?: string;
  } = {};
  for (let i = 0; i <= idx; i++) {
    const s = stages[i]!;
    const key = STAGE_AT_KEYS[s];
    if (!prev[s]) out[key] = now;
  }
  return out;
}

export function formatWorkflowStageTime(iso: string | null | undefined): string | null {
  if (typeof iso !== "string" || iso.trim().length < 10) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
