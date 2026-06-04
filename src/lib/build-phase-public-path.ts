import type { BuildSubjectKind } from "@/lib/build-subject";

export function buildPhaseRenderPublicPath(
  kind: BuildSubjectKind,
  subjectId: string,
  storedFile: string
): string {
  return `/api/build-phase-render/${encodeURIComponent(kind)}/${encodeURIComponent(subjectId)}/${encodeURIComponent(storedFile)}`;
}

export function buildPhaseIoPublicPath(
  kind: BuildSubjectKind,
  subjectId: string,
  storedFile: string
): string {
  return `/api/build-phase-io/${encodeURIComponent(kind)}/${encodeURIComponent(subjectId)}/${encodeURIComponent(storedFile)}`;
}
