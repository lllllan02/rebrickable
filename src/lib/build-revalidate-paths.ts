import { revalidatePath } from "next/cache";

import {
  buildSubjectDetailPath,
  buildSubjectListPath,
  mocIoBatchPath,
  mocIoSplitPath,
} from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";

export function revalidateBuildSubjectPaths(kind: BuildSubjectKind, subjectId: string): void {
  revalidatePath(buildSubjectListPath(kind));
  revalidatePath(buildSubjectDetailPath(kind, subjectId));
}

export function revalidateMocIoSplitPaths(mocId: string): void {
  revalidatePath(buildSubjectDetailPath(BUILD_SUBJECT_MOC, mocId));
  revalidatePath(mocIoSplitPath(mocId));
}

export function revalidateIoBatchPaths(mocId: string, batchId: number): void {
  revalidateMocIoSplitPaths(mocId);
  revalidatePath(mocIoBatchPath(mocId, batchId));
}
