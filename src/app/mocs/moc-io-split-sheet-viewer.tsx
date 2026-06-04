"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchIoBatchFullSheetAction,
  fetchIoBatchFulfillmentSheetAction,
  fetchIoBatchShortageSheetAction,
  fetchIoPlanMergedShortageAction,
} from "@/app/mocs/io-batch-parts-sheet-actions";
import { MocPartsList } from "@/app/mocs/moc-parts-list";
import type { SheetRowReplaceContext } from "@/app/mocs/sheet-row-replace-panel";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import {
  getIoSplitSheetErrorFromCache,
  getIoSplitSheetFromCache,
  invalidateIoPlanCachesForBatches,
  invalidateIoSplitSheetCacheForBatch,
  ioBatchSheetLoadKey,
  ioPlanMergedShortageLoadKey,
  isIoSplitSheetLoadSettled,
  loadIoSplitSheet,
  type IoSplitSheetLoadResult,
  type IoSplitSheetRowProvenance,
  type IoSplitSheetState,
} from "@/lib/io-split-sheet-cache";

export type { IoSplitSheetState };

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  onSheetLoaded?: (sheet: IoSplitSheetState | null, error: string | null) => void;
  /** 更换/还原后同时刷新方案级汇总缺件缓存 */
  planBatchIds?: number[];
} & (
  | {
      mode: "batch-full";
      batchId: number;
    }
  | {
      mode: "batch-shortage";
      batchId: number;
    }
  | {
      mode: "batch-fulfillment";
      batchId: number;
    }
  | {
      mode: "plan-merged-shortage";
      batchIds: number[];
    }
);

type IoSplitSheetFetchResult =
  | Awaited<ReturnType<typeof fetchIoBatchFullSheetAction>>
  | Awaited<ReturnType<typeof fetchIoPlanMergedShortageAction>>;

function fetchResultToSheet(r: IoSplitSheetFetchResult): IoSplitSheetState | null {
  if (!r.ok) return null;
  let shortageProvenanceByLine: Record<number, IoSplitSheetRowProvenance[]> | undefined;
  if ("shortageProvenanceByLine" in r) {
    shortageProvenanceByLine = r.shortageProvenanceByLine;
  }
  return {
    items: r.items,
    skippedHeader: r.skippedHeader,
    savedAt: r.savedAt,
    shortageProvenanceByLine,
  };
}

function sheetRowReplaceContextForBatch(
  subjectKind: BuildSubjectKind,
  subjectId: string,
  batchId: number,
  branch: "fulfillment" | "shortage",
): SheetRowReplaceContext {
  return { subjectKind, subjectId, branch, ioBatchId: batchId };
}

export function MocIoSplitSheetViewer({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  onSheetLoaded,
  planBatchIds = [],
  ...props
}: Props) {
  const mode = props.mode;
  const batchId = "batchId" in props ? props.batchId : 0;
  const batchIdsKey = "batchIds" in props ? props.batchIds.join(",") : "";
  const planBatchIdsKey = planBatchIds.join(",");

  const loadKey =
    mode === "plan-merged-shortage"
      ? ioPlanMergedShortageLoadKey(
          batchIdsKey ? batchIdsKey.split(",").map((s) => Number(s)) : [],
        )
      : ioBatchSheetLoadKey(mode, batchId);

  const [sheet, setSheet] = useState<IoSplitSheetState | null>(
    () => getIoSplitSheetFromCache(loadKey) ?? null,
  );
  const [error, setError] = useState<string | null>(
    () => getIoSplitSheetErrorFromCache(loadKey) ?? null,
  );
  const [loading, setLoading] = useState(() => !isIoSplitSheetLoadSettled(loadKey));

  const onSheetLoadedRef = useRef(onSheetLoaded);
  onSheetLoadedRef.current = onSheetLoaded;
  const lastNotifyKeyRef = useRef<string | null>(null);

  const notifyLoaded = useCallback((next: IoSplitSheetState | null, err: string | null) => {
    const token = `${loadKey}\0${next?.savedAt ?? ""}\0${next?.items.length ?? 0}\0${err ?? ""}`;
    if (lastNotifyKeyRef.current === token) return;
    lastNotifyKeyRef.current = token;
    onSheetLoadedRef.current?.(next, err);
  }, [loadKey]);

  const fetchSheet = useCallback(async (): Promise<IoSplitSheetLoadResult> => {
    const batchIds = batchIdsKey
      ? batchIdsKey.split(",").map((s) => Number(s)).filter((id) => id > 0)
      : [];
    const r =
      mode === "batch-full"
        ? await fetchIoBatchFullSheetAction(batchId)
        : mode === "batch-shortage"
          ? await fetchIoBatchShortageSheetAction(batchId)
          : mode === "batch-fulfillment"
            ? await fetchIoBatchFulfillmentSheetAction(batchId)
            : await fetchIoPlanMergedShortageAction(batchIds);
    const next = fetchResultToSheet(r);
    if (!next) return { ok: false as const, error: r.ok ? "暂无零件数据。" : r.error };
    return { ok: true as const, sheet: next };
  }, [batchId, batchIdsKey, mode]);

  const applyLoadResult = useCallback(
    (result: IoSplitSheetLoadResult) => {
      if (result.ok) {
        setSheet(result.sheet);
        setError(null);
        notifyLoaded(result.sheet, null);
        return;
      }
      if (!getIoSplitSheetFromCache(loadKey)) setSheet(null);
      setError(result.error);
      notifyLoaded(getIoSplitSheetFromCache(loadKey) ?? null, result.error);
    },
    [loadKey, notifyLoaded],
  );

  const prevLoadKeyRef = useRef(loadKey);

  useEffect(() => {
    if (prevLoadKeyRef.current !== loadKey) {
      lastNotifyKeyRef.current = null;
      prevLoadKeyRef.current = loadKey;
    }

    let cancelled = false;
    const cached = getIoSplitSheetFromCache(loadKey);
    const cachedError = getIoSplitSheetErrorFromCache(loadKey);
    setSheet(cached ?? null);
    setError(cachedError ?? null);
    setLoading(!isIoSplitSheetLoadSettled(loadKey));
    if (cached) notifyLoaded(cached, null);
    else if (cachedError) notifyLoaded(null, cachedError);

    if (isIoSplitSheetLoadSettled(loadKey)) {
      return () => {
        cancelled = true;
      };
    }

    void loadIoSplitSheet(loadKey, fetchSheet).then((result) => {
      if (cancelled) return;
      setLoading(false);
      applyLoadResult(result);
    });

    return () => {
      cancelled = true;
    };
  }, [applyLoadResult, fetchSheet, loadKey, notifyLoaded]);

  const invalidateRelatedCaches = useCallback(() => {
    if (mode === "plan-merged-shortage") {
      const batchIds = batchIdsKey
        ? batchIdsKey.split(",").map((s) => Number(s)).filter((id) => id > 0)
        : [];
      invalidateIoPlanCachesForBatches(batchIds);
      return;
    }
    invalidateIoSplitSheetCacheForBatch(batchId);
    const planIds = planBatchIdsKey
      ? planBatchIdsKey.split(",").map((s) => Number(s)).filter((id) => id > 0)
      : [batchId];
    if (planIds.length > 0) invalidateIoPlanCachesForBatches(planIds);
  }, [batchId, batchIdsKey, mode, planBatchIdsKey]);

  const reloadSheetAfterMutation = useCallback(async () => {
    invalidateRelatedCaches();
    lastNotifyKeyRef.current = null;
    setLoading(true);
    const result = await loadIoSplitSheet(loadKey, fetchSheet);
    setLoading(false);
    applyLoadResult(result);
  }, [applyLoadResult, fetchSheet, invalidateRelatedCaches, loadKey]);

  const shortageMode = mode === "batch-shortage" || mode === "plan-merged-shortage";
  const detailSubstituteSuggestions =
    mode === "batch-fulfillment" ||
    mode === "batch-shortage" ||
    mode === "plan-merged-shortage";

  const shortageProvenanceByLine = sheet?.shortageProvenanceByLine;

  const sheetRowReplaceContext: SheetRowReplaceContext | null = useMemo(() => {
    if (mode === "batch-fulfillment") {
      return sheetRowReplaceContextForBatch(subjectKind, subjectId, batchId, "fulfillment");
    }
    if (mode === "batch-shortage") {
      return sheetRowReplaceContextForBatch(subjectKind, subjectId, batchId, "shortage");
    }
    if (mode === "plan-merged-shortage" && shortageProvenanceByLine) {
      return {
        subjectKind,
        subjectId,
        branch: "shortage",
        resolveReplaceTargets: (item) => {
          const sources = shortageProvenanceByLine[item.lineNumber];
          if (!sources?.length) return null;
          return sources.map((prov) => ({
            ioBatchId: prov.batchId,
            lineNumber: prov.sourceLineNumber,
          }));
        },
      };
    }
    return null;
  }, [batchId, mode, shortageProvenanceByLine, subjectId, subjectKind]);

  const sourceMetaLine =
    mode === "plan-merged-shortage" ? "汇总各包缺件；更换后写入对应分包配货表。" : null;

  return (
    <div className="relative min-h-[min(42vh,28rem)]">
      {loading && !sheet ? (
        <p className="text-sm text-[var(--muted)]">正在加载零件表…</p>
      ) : null}
      {error && !sheet ? <p className="text-sm text-red-200/95">{error}</p> : null}
      {!loading && sheet && sheet.items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">暂无零件数据。</p>
      ) : null}
      {sheet && sheet.items.length > 0 ? (
        <>
          {loading ? (
            <p
              className="absolute right-0 top-0 z-10 rounded-full border border-[var(--border-soft)] bg-[var(--surface)]/95 px-2.5 py-0.5 text-[11px] text-[var(--muted)] shadow-sm backdrop-blur-sm"
              aria-live="polite"
            >
              更新中…
            </p>
          ) : null}
          <div
            className={
              loading ? "pointer-events-none opacity-80 transition-opacity duration-150" : undefined
            }
            aria-busy={loading}
          >
            <MocPartsList
              items={sheet.items}
              skippedHeader={sheet.skippedHeader}
              savedAt={sheet.savedAt ?? "2000-01-01T00:00:00.000Z"}
              totalPartQty={undefined}
              shortageListMode={shortageMode}
              detailSubstituteSuggestions={detailSubstituteSuggestions}
              sourceMetaLine={sourceMetaLine}
              sheetRowReplaceContext={sheetRowReplaceContext}
              onSheetRowMutated={reloadSheetAfterMutation}
            />
          </div>
        </>
      ) : null}
      {error && sheet ? <p className="mt-2 text-xs text-red-200/90">{error}</p> : null}
    </div>
  );
}
