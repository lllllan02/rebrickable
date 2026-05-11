import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";

/** 列表页路径；可安全用于 Client Component（无 next/cache）。 */
export function buildSubjectListPath(kind: BuildSubjectKind): "/mocs" | "/sets" {
  return kind === BUILD_SUBJECT_MOC ? "/mocs" : "/sets";
}

export function buildSubjectDetailPath(kind: BuildSubjectKind, subjectId: string): string {
  return `${buildSubjectListPath(kind)}/${encodeURIComponent(subjectId)}`;
}
