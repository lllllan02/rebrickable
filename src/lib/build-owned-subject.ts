import { isBuildSubjectKind, isSafeBuildSubjectId } from "@/lib/build-subject";
import type { WorkflowSubjectKind } from "@/lib/build-workflow-stage";

/** @deprecated 使用 WorkflowSubjectKind */
export type OwnedSubjectKind = WorkflowSubjectKind;

export function isOwnedSubjectKind(v: string): v is WorkflowSubjectKind {
  return isBuildSubjectKind(v);
}

export function isSafeOwnedSubjectId(kind: WorkflowSubjectKind, id: string): boolean {
  return isSafeBuildSubjectId(kind, id);
}
