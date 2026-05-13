import { revalidatePath } from "next/cache";

import { buildSubjectDetailPath, buildSubjectListPath } from "@/lib/build-subject-paths";
import type { BuildSubjectKind } from "@/lib/build-subject";

export function revalidateFavoritePaths(kind: BuildSubjectKind, subjectId: string): void {
  revalidatePath(buildSubjectListPath(kind));
  revalidatePath(buildSubjectDetailPath(kind, subjectId));
}
