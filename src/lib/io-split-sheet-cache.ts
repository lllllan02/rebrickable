import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 汇总表展示行 → 源分包中的行（配货或缺件） */
export type IoSplitSheetRowProvenance = {
  batchId: number;
  sourceLineNumber: number;
};

export type IoSplitSheetState = {
  items: ShortageResolveItem[];
  skippedHeader: boolean;
  savedAt: string | null;
  /** plan-merged-shortage：展示行 → 源分包缺件行（同零件+色可能来自多包） */
  shortageProvenanceByLine?: Record<number, IoSplitSheetRowProvenance[]>;
};

export type IoSplitSheetLoadResult =
  | { ok: true; sheet: IoSplitSheetState }
  | { ok: false; error: string };

const sheetCache = new Map<string, IoSplitSheetState>();
const sheetErrorCache = new Map<string, string>();
const inflight = new Map<string, Promise<IoSplitSheetLoadResult>>();

export function getIoSplitSheetFromCache(loadKey: string): IoSplitSheetState | undefined {
  return sheetCache.get(loadKey);
}

export function getIoSplitSheetErrorFromCache(loadKey: string): string | undefined {
  return sheetErrorCache.get(loadKey);
}

/** 已成功加载或已记录失败（如无数据），无需再次请求 */
export function isIoSplitSheetLoadSettled(loadKey: string): boolean {
  return sheetCache.has(loadKey) || sheetErrorCache.has(loadKey);
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

  const cachedError = sheetErrorCache.get(loadKey);
  if (cachedError) {
    return Promise.resolve({ ok: false, error: cachedError });
  }

  const running = inflight.get(loadKey);
  if (running) return running;

  const promise = loader()
    .then((result) => {
      if (result.ok) {
        sheetCache.set(loadKey, result.sheet);
        sheetErrorCache.delete(loadKey);
      } else {
        sheetErrorCache.set(loadKey, result.error);
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
  return `merged-shortage:${batchIds.join(",")}`;
}

const IO_BATCH_SHEET_MODES = ["batch-full", "batch-shortage", "batch-fulfillment"] as const;

/** 更换/还原零件或重新上传后，丢弃该分包在内存中的零件表缓存 */
function dropIoSplitSheetCacheEntry(loadKey: string): void {
  sheetCache.delete(loadKey);
  sheetErrorCache.delete(loadKey);
  inflight.delete(loadKey);
}

export function invalidateIoSplitSheetCacheForBatch(batchId: number): void {
  if (!Number.isFinite(batchId) || batchId < 1) return;
  for (const mode of IO_BATCH_SHEET_MODES) {
    dropIoSplitSheetCacheEntry(ioBatchSheetLoadKey(mode, batchId));
  }
}

export function invalidateIoPlanMergedShortageCache(batchIds: number[]): void {
  dropIoSplitSheetCacheEntry(ioPlanMergedShortageLoadKey(batchIds));
}

/** 分包行变更后，同时丢弃方案级汇总缺件缓存 */
export function invalidateIoPlanCachesForBatches(batchIds: number[]): void {
  if (batchIds.length === 0) return;
  invalidateIoPlanMergedShortageCache(batchIds);
}
