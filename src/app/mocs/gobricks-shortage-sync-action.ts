"use server";

import { BUILD_SUBJECT_MOC, isSafeBuildSubjectId, type BuildSubjectKind } from "@/lib/build-subject";
import {
  applyGobricksSyncForBuildSubject,
  applyGobricksSyncForIoBatch,
  type GobricksSyncApplyResult,
} from "@/lib/gobricks-sync-io-batch";

const MAX_SUBJECT_ID_LEN = 128;

function subjectKindLabel(kind: BuildSubjectKind): string {
  return kind === BUILD_SUBJECT_MOC ? "MOC" : "套装";
}

export type SyncGobricksShortageForSubjectOk = {
  ok: true;
  shortageLines: number;
  fulfillmentLines: number;
  message: string;
};

export type SyncGobricksShortageForSubjectResult = GobricksSyncApplyResult;

export async function syncGobricksShortageForSubjectAction(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  ioBatchId?: number;
  /** 为 true 时表示用户已确认可覆盖缺件/配货表中含「更换零件」的行 */
  confirmOverwriteModified?: boolean;
}): Promise<SyncGobricksShortageForSubjectResult> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }

  const ioBatchId =
    input.ioBatchId != null && Number.isFinite(input.ioBatchId) && input.ioBatchId > 0
      ? input.ioBatchId
      : undefined;

  if (ioBatchId) {
    return applyGobricksSyncForIoBatch(ioBatchId, {
      confirmOverwriteModified: input.confirmOverwriteModified,
    });
  }

  return applyGobricksSyncForBuildSubject({
    subjectKind: input.subjectKind,
    subjectId,
    confirmOverwriteModified: input.confirmOverwriteModified,
  });
}
