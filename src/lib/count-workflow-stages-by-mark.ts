import type { BuildSubjectKind } from "@/lib/build-subject";
import { workflowStageFromRow } from "@/lib/build-workflow-from-row";
import { listMarkFilterOptionsForKind } from "@/lib/build-workflow-stage";

/** 按列表 `mark` 筛选项统计条数（「全部」含收录阶段） */
export function countWorkflowStagesByMark(
  rows: readonly { workflowStage: string }[],
  kind: BuildSubjectKind
): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length };
  for (const opt of listMarkFilterOptionsForKind(kind)) {
    if (opt.key !== "all") counts[opt.key] = 0;
  }
  for (const row of rows) {
    const stage = workflowStageFromRow(row, kind);
    if (!stage || stage === "collected") continue;
    if (Object.prototype.hasOwnProperty.call(counts, stage)) {
      counts[stage]! += 1;
    }
  }
  return counts;
}
