import { revalidatePath } from "next/cache";

import { buildSubjectDetailPath, buildSubjectListPath } from "@/lib/build-subject-paths";
import type { WorkflowSubjectKind } from "@/lib/build-workflow-stage";

export function revalidateWorkflowPaths(kind: WorkflowSubjectKind, subjectId: string): void {
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath(buildSubjectListPath(kind));
  revalidatePath(buildSubjectDetailPath(kind, subjectId));
}
