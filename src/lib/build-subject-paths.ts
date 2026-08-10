import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";

/** 列表页路径；可安全用于 Client Component（无 next/cache）。 */
export function buildSubjectListPath(kind: BuildSubjectKind): "/mocs" | "/sets" {
  return kind === BUILD_SUBJECT_MOC ? "/mocs" : "/sets";
}

export function buildSubjectDetailPath(kind: BuildSubjectKind, subjectId: string): string {
  return `${buildSubjectListPath(kind)}/${encodeURIComponent(subjectId)}`;
}

/** Studio .io 分步导出向导（Client / Server 均可引用） */
export function mocIoSplitPath(mocId: string): string {
  return `${buildSubjectDetailPath(BUILD_SUBJECT_MOC, mocId)}/io-split`;
}

export function mocIoBatchPath(mocId: string, batchId: number): string {
  return `${buildSubjectDetailPath(BUILD_SUBJECT_MOC, mocId)}/io-batches/${batchId}`;
}

/** 手动分包工作页；可选 planId 继续编辑 */
export function buildSubjectManualSplitPath(
  kind: BuildSubjectKind,
  subjectId: string,
  planId?: number
): string {
  const base = `${buildSubjectDetailPath(kind, subjectId)}/manual-split`;
  if (planId != null && Number.isFinite(planId) && planId > 0) {
    return `${base}?planId=${Math.trunc(planId)}`;
  }
  return base;
}
