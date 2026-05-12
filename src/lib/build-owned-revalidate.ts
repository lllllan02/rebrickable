import { revalidatePath } from "next/cache";

import { buildSubjectDetailPath, buildSubjectListPath } from "@/lib/build-subject-paths";
import { OWNED_SUBJECT_PART, type OwnedSubjectKind } from "@/lib/build-owned-subject";

export function revalidateOwnedPaths(kind: OwnedSubjectKind, subjectId: string): void {
  revalidatePath("/owned");
  if (kind === OWNED_SUBJECT_PART) {
    revalidatePath("/parts");
    revalidatePath(`/parts/${encodeURIComponent(subjectId)}`);
    return;
  }
  revalidatePath(buildSubjectListPath(kind));
  revalidatePath(buildSubjectDetailPath(kind, subjectId));
}
