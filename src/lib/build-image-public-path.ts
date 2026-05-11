import type { BuildSubjectKind } from "@/lib/build-subject";

export function buildImagePublicPath(
  kind: BuildSubjectKind,
  subjectId: string,
  storedFile: string
): string {
  return `/api/build-images/${encodeURIComponent(kind)}/${encodeURIComponent(subjectId)}/${encodeURIComponent(storedFile)}`;
}
