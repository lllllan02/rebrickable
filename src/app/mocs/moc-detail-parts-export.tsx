"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { downloadPartsSheetXlsx } from "@/lib/parts-sheet-xlsx-download";
import { serializeShortageCsv } from "@/lib/serialize-shortage-csv";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type Props = {
  mocId: string;
  listTab: "full" | "shortage";
  initialFull: InitialMocSheetFromServer | null;
  initialShortage: InitialMocSheetFromServer | null;
};

export function MocDetailPartsListExportBar({
  mocId,
  listTab,
  initialFull,
  initialShortage,
}: Props) {
  const branch = listTab === "full" ? initialFull : initialShortage;
  const canExport = Boolean(branch && branch.items.length > 0);
  const exportProgressTitleId = useId();
  const exportProgressDialogRef = useRef<HTMLDialogElement>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<{
    jobId: string;
    total: number;
    current: number;
    writingFile: boolean;
  } | null>(null);

  const filenameStem = useMemo(() => {
    const qid = mocId.trim();
    if (listTab === "full") {
      return (qid ? `moc-${qid}-full` : "full-parts") + "-edited";
    }
    return (qid ? `moc-${qid}-shortage` : "shortage-parts") + "-edited";
  }, [listTab, mocId]);

  useEffect(() => {
    if (!exportProgress) return;
    const d = exportProgressDialogRef.current;
    if (d && !d.open) d.showModal();
  }, [exportProgress]);

  const exportBarPercent =
    exportProgress === null
      ? 0
      : exportProgress.writingFile
        ? 97
        : exportProgress.total > 0
          ? Math.min(94, Math.round((exportProgress.current / exportProgress.total) * 94))
          : 0;

  const onExportCsv = useCallback(() => {
    if (!branch || branch.items.length === 0) return;
    setExportError(null);
    const text = serializeShortageCsv(
      branch.items.map((r) => ({
        partNum: r.partNum,
        colorId: r.colorId,
        quantity: r.quantity,
        rest: r.rest,
      })),
      { includeHeader: branch.skippedHeader }
    );
    downloadText(`${filenameStem}.csv`, text);
  }, [branch, filenameStem]);

  const onExportXlsx = useCallback(async () => {
    if (!branch || branch.items.length === 0) return;
    setExportBusy(true);
    setExportError(null);
    setExportProgress({
      jobId: "export",
      total: branch.items.length,
      current: 0,
      writingFile: false,
    });
    try {
      const result = await downloadPartsSheetXlsx(branch.items, filenameStem, (p) => {
        setExportProgress((prev) =>
          prev ? { ...prev, current: p.current, total: p.total, writingFile: p.writingFile } : prev
        );
      });
      if (!result.ok) {
        setExportError(result.error);
      }
    } catch {
      setExportError("导出 Excel 失败，请重试。");
    } finally {
      exportProgressDialogRef.current?.close();
      setExportProgress(null);
      setExportBusy(false);
    }
  }, [branch, filenameStem]);

  const tabLabel = listTab === "full" ? "完整零件表" : "缺件表";

  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-1 sm:w-auto">
      <div className="inline-flex max-w-full flex-nowrap items-center gap-1.5">
        <span className="hidden shrink-0 text-[10px] text-[var(--muted-2)] sm:inline">
          「{tabLabel}」
        </span>
        <button
          type="button"
          className="button-primary shrink-0 rounded-md !py-1 !px-2.5 text-xs font-semibold leading-none disabled:opacity-45"
          disabled={!canExport || exportBusy}
          title={
            !canExport
              ? `当前未选中或未上传${tabLabel}`
              : "导出为 Excel，工作表中含零件缩略图"
          }
          onClick={() => void onExportXlsx()}
        >
          {exportBusy ? (
            "…"
          ) : (
            <span className="inline-flex items-baseline gap-0.5">
              <span>Excel</span>
              <span className="text-[9px] font-normal opacity-90">含图片</span>
            </span>
          )}
        </button>
        <button
          type="button"
          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium leading-none text-[var(--text)] hover:bg-[var(--surface-3)] disabled:opacity-45"
          disabled={!canExport || exportBusy}
          title={
            !canExport
              ? `当前未选中或未上传${tabLabel}`
              : "导出 CSV（无图，可再导入）"
          }
          onClick={onExportCsv}
        >
          CSV
        </button>
      </div>
      <p className="text-right text-[10px] text-[var(--muted)] sm:hidden">导出「{tabLabel}」</p>
      {exportError ? <p className="max-w-full text-right text-[11px] text-red-200/95">{exportError}</p> : null}

      <dialog
        ref={exportProgressDialogRef}
        className="fixed left-1/2 top-1/2 z-[210] m-0 w-[min(100vw-1.5rem,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/55"
        aria-labelledby={exportProgressTitleId}
        aria-busy={exportBusy}
        onClose={() => {
          setExportBusy(false);
          setExportProgress(null);
        }}
      >
        {exportProgress ? (
          <div className="space-y-3">
            <h2 id={exportProgressTitleId} className="text-sm font-semibold">
              导出 Excel（含图片）
            </h2>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 ease-out"
                style={{ width: `${exportBarPercent}%` }}
              />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {exportProgress.writingFile
                ? "正在写入工作簿…"
                : `处理行：${exportProgress.current} / ${exportProgress.total}（含拉取缩略图）`}
            </p>
            <p className="text-[11px] text-[var(--muted-2)]">完成后将自动下载。</p>
            <button
              type="button"
              className="w-full rounded-md border border-[var(--border)] py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)]"
              onClick={() => exportProgressDialogRef.current?.close()}
            >
              取消等待
            </button>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
