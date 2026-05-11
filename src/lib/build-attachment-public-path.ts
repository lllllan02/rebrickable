import type { BuildSubjectKind } from "@/lib/build-subject";

export function buildAttachmentPublicPath(
  kind: BuildSubjectKind,
  subjectId: string,
  storedFile: string
): string {
  return `/api/build-attachments/${encodeURIComponent(kind)}/${encodeURIComponent(subjectId)}/${encodeURIComponent(storedFile)}`;
}
