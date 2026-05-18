"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  getIoSplitSheetFromCache,
  invalidateIoPlanMergedShortageCache,
  invalidateIoSplitSheetCacheForBatch,
  ioBatchSheetLoadKey,
  ioPlanMergedShortageLoadKey,
  loadIoSplitSheet,
  type IoSplitSheetLoadResult,
  type IoSplitSheetState,
} from "@/lib/io-split-sheet-cache";

export type { IoSplitSheetState };

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  parentSubjectOwned?: boolean;
  onSheetLoaded?: (sheet: IoSplitSheetState | null, error: string | null) => void;
  onShortageRowReplacedToFulfillment?: () => void;
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

function fetchResultToSheet(
  r: Awaited<ReturnType<typeof fetchIoBatchFullSheetAction>>,
): IoSplitSheetState | null {
  if (!r.ok) return null;
  return {
    items: r.items,
    skippedHeader: r.skippedHeader,
    savedAt: r.savedAt,
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
  parentSubjectOwned = false,
  onSheetLoaded,
  onShortageRowReplacedToFulfillment,
  ...props
}: Props) {
  const loadKey =
    props.mode === "plan-merged-shortage"
      ? ioPlanMergedShortageLoadKey(props.batchIds)
      : ioBatchSheetLoadKey(props.mode, props.batchId);

  const [sheet, setSheet] = useState<IoSplitSheetState | null>(
    () => getIoSplitSheetFromCache(loadKey) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !getIoSplitSheetFromCache(loadKey));

  const onSheetLoadedRef = useRef(onSheetLoaded);
  onSheetLoadedRef.current = onSheetLoaded;
  const lastNotifyKeyRef = useRef<string | null>(null);

  const notifyLoaded = (next: IoSplitSheetState | null, err: string | null) => {
    const token = `${loadKey}\0${next?.savedAt ?? ""}\0${next?.items.length ?? 0}\0${err ?? ""}`;
    if (lastNotifyKeyRef.current === token) return;
    lastNotifyKeyRef.current = token;
    onSheetLoadedRef.current?.(next, err);
  };

  const fetchSheet = useCallback(async (): Promise<IoSplitSheetLoadResult> => {
    const r =
      props.mode === "batch-full"
        ? await fetchIoBatchFullSheetAction(props.batchId)
        : props.mode === "batch-shortage"
          ? await fetchIoBatchShortageSheetAction(props.batchId)
          : props.mode === "batch-fulfillment"
            ? await fetchIoBatchFulfillmentSheetAction(props.batchId)
            : await fetchIoPlanMergedShortageAction(props.batchIds);
    const next = fetchResultToSheet(r);
    if (!next) return { ok: false as const, error: r.ok ? "暂无零件数据。" : r.error };
    return { ok: true as const, sheet: next };
  }, [props]);

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
    [loadKey],
  );

  useEffect(() => {
    lastNotifyKeyRef.current = null;
    let cancelled = false;
    const cached = getIoSplitSheetFromCache(loadKey);
    setSheet(cached ?? null);
    setError(null);
    setLoading(!cached);
    if (cached) notifyLoaded(cached, null);

    void loadIoSplitSheet(loadKey, fetchSheet).then((result) => {
      if (cancelled) return;
      setLoading(false);
      applyLoadResult(result);
    });

    return () => {
      cancelled = true;
    };
  }, [applyLoadResult, fetchSheet, loadKey]);

  const reloadSheetAfterMutation = useCallback(async () => {
    if (props.mode === "plan-merged-shortage") {
      invalidateIoPlanMergedShortageCache(props.batchIds);
    } else {
      invalidateIoSplitSheetCacheForBatch(props.batchId);
    }
    lastNotifyKeyRef.current = null;
    setLoading(true);
    const result = await loadIoSplitSheet(loadKey, fetchSheet);
    setLoading(false);
    applyLoadResult(result);
  }, [applyLoadResult, fetchSheet, loadKey, props]);

  const shortageMode =
    props.mode === "batch-shortage" || props.mode === "plan-merged-shortage";
  const detailSubstituteSuggestions =
    props.mode === "batch-fulfillment" ||
    props.mode === "batch-shortage" ||
    props.mode === "plan-merged-shortage";

  const sheetRowReplaceContext: SheetRowReplaceContext | null =
    props.mode === "batch-fulfillment"
      ? sheetRowReplaceContextForBatch(subjectKind, subjectId, props.batchId, "fulfillment")
      : props.mode === "batch-shortage"
        ? sheetRowReplaceContextForBatch(subjectKind, subjectId, props.batchId, "shortage")
        : null;

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
              parentSubjectOwned={parentSubjectOwned}
              shortageListMode={shortageMode}
              detailSubstituteSuggestions={detailSubstituteSuggestions}
              sheetRowReplaceContext={sheetRowReplaceContext}
              onSheetRowMutated={reloadSheetAfterMutation}
              onShortageRowReplacedToFulfillment={
                props.mode === "batch-shortage" ? onShortageRowReplacedToFulfillment : undefined
              }
            />
          </div>
        </>
      ) : null}
      {error && sheet ? <p className="mt-2 text-xs text-red-200/90">{error}</p> : null}
    </div>
  );
}
