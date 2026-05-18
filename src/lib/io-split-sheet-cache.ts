import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type IoSplitSheetState = {
  items: ShortageResolveItem[];
  skippedHeader: boolean;
  savedAt: string | null;
};

export type IoSplitSheetLoadResult =
  | { ok: true; sheet: IoSplitSheetState }
  | { ok: false; error: string };

const sheetCache = new Map<string, IoSplitSheetState>();
const inflight = new Map<string, Promise<IoSplitSheetLoadResult>>();

export function getIoSplitSheetFromCache(loadKey: string): IoSplitSheetState | undefined {
  return sheetCache.get(loadKey);
}

export function primeIoSplitSheetCache(loadKey: string, sheet: IoSplitSheetState) {
  sheetCache.set(loadKey, sheet);
}

/** 同一 loadKey 并发只发一次请求；命中缓存则不再请求 */
export function loadIoSplitSheet(
  loadKey: string,
  loader: () => Promise<IoSplitSheetLoadResult>,
): Promise<IoSplitSheetLoadResult> {
  const cached = sheetCache.get(loadKey);
  if (cached) {
    return Promise.resolve({ ok: true, sheet: cached });
  }

  const running = inflight.get(loadKey);
  if (running) return running;

  const promise = loader()
    .then((result) => {
      if (result.ok) {
        sheetCache.set(loadKey, result.sheet);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(loadKey);
    });

  inflight.set(loadKey, promise);
  return promise;
}

export function ioBatchSheetLoadKey(
  mode: "batch-full" | "batch-shortage" | "batch-fulfillment",
  batchId: number,
): string {
  return `${mode}:${batchId}`;
}

export function ioPlanMergedShortageLoadKey(batchIds: number[]): string {
  return `merged:${batchIds.join(",")}`;
}

const IO_BATCH_SHEET_MODES = ["batch-full", "batch-shortage", "batch-fulfillment"] as const;

/** 更换/还原零件或重新上传后，丢弃该分包在内存中的零件表缓存 */
export function invalidateIoSplitSheetCacheForBatch(batchId: number): void {
  if (!Number.isFinite(batchId) || batchId < 1) return;
  for (const mode of IO_BATCH_SHEET_MODES) {
    const key = ioBatchSheetLoadKey(mode, batchId);
    sheetCache.delete(key);
    inflight.delete(key);
  }
}

export function invalidateIoPlanMergedShortageCache(batchIds: number[]): void {
  const key = ioPlanMergedShortageLoadKey(batchIds);
  sheetCache.delete(key);
  inflight.delete(key);
}
