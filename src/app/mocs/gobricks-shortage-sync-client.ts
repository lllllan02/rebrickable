"use client";

import type { SyncGobricksShortageForSubjectOk } from "@/app/mocs/gobricks-shortage-sync-action";
import { syncGobricksShortageForSubjectAction } from "@/app/mocs/gobricks-shortage-sync-action";
import type { BuildSubjectKind } from "@/lib/build-subject";

export type { SyncGobricksShortageForSubjectOk };

/**
 * 调用高砖同步；若服务端检测到缺件/配货表含「更换零件」行，则 `window.confirm` 二次确认后再带标志重试。
 */
export async function syncGobricksShortageForSubjectWithModifiedConfirm(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  ioBatchId?: number;
}): Promise<SyncGobricksShortageForSubjectOk | { ok: false; error: string; cancelled?: boolean }> {
  let confirmOverwriteModified = false;
  for (;;) {
    const r = await syncGobricksShortageForSubjectAction({
      ...input,
      confirmOverwriteModified,
    });
    if (r.ok) return r;
    if ("needsConfirmOverwriteModified" in r && r.needsConfirmOverwriteModified) {
      const ok = typeof window !== "undefined" && window.confirm(r.message);
      if (!ok) return { ok: false, error: "已取消同步。", cancelled: true };
      confirmOverwriteModified = true;
      continue;
    }
    return { ok: false, error: "error" in r ? r.error : "同步失败。" };
  }
}
