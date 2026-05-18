"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";
import {
  buildPartsSheetExportStem,
  FULFILLMENT_MODIFIED_EXPORT_CONTENT_LABEL,
} from "@/lib/parts-sheet-export-filename";
import { downloadPartsSheetXlsx } from "@/lib/parts-sheet-xlsx-download";
import {
  countFulfillmentModifiedExportable,
  serializeFulfillmentModifiedCsv,
} from "@/lib/fulfillment-modified-csv-export";
import { partsSheetRowToBrickLinkInventoryXmlRow } from "@/lib/parts-sheet-export-lego-color";
import { serializeBrickLinkInventoryXml } from "@/lib/serialize-bricklink-inventory-xml";
import { serializeShortageCsv } from "@/lib/serialize-shortage-csv";

function downloadText(filename: string, text: string, mimeType = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
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

export type PartsSheetExportSource = {
  items: ShortageResolveItem[];
  skippedHeader: boolean;
  savedAt: string | null;
};

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  /** 用于导出文件名中间段；可与资料页显示名一致 */
  exportDisplayName: string;
  listTab: "full" | "shortage" | "fulfillment";
  initialFull?: InitialMocSheetFromServer | null;
  initialShortage?: InitialMocSheetFromServer | null;
  initialFulfillment?: InitialMocSheetFromServer | null;
  /** 覆盖从 initial* 解析的分支数据（如 Studio 分包内嵌查看） */
  activeSheet?: PartsSheetExportSource | null;
  /** 配货表「修改 CSV」数据源；默认同 activeSheet / initialFulfillment */
  fulfillmentForModified?: PartsSheetExportSource | null;
  /** 覆盖默认文件名主体 */
  filenameStemOverride?: string;
  /** 覆盖「修改 CSV」文件名主体 */
  modifiedFilenameStemOverride?: string;
};

function toExportSource(
  sheet: InitialMocSheetFromServer | PartsSheetExportSource | null | undefined,
): PartsSheetExportSource | null {
  if (!sheet?.items.length) return null;
  return {
    items: sheet.items,
    skippedHeader: sheet.skippedHeader,
    savedAt: sheet.savedAt,
  };
}

export function MocDetailPartsListExportBar({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  exportDisplayName,
  listTab,
  initialFull = null,
  initialShortage = null,
  initialFulfillment = null,
  activeSheet,
  fulfillmentForModified,
  filenameStemOverride,
  modifiedFilenameStemOverride,
}: Props) {
  const branchFromInitial =
    listTab === "full" ? initialFull : listTab === "shortage" ? initialShortage : initialFulfillment;
  const branch = activeSheet ?? toExportSource(branchFromInitial);
  const fulfillmentBranch =
    fulfillmentForModified ??
    toExportSource(initialFulfillment) ??
    (listTab === "fulfillment" ? branch : null);

  const canExport = Boolean(branch && branch.items.length > 0);
  const fulfillmentModifiedCounts = useMemo(() => {
    if (listTab !== "fulfillment" || !fulfillmentBranch?.items.length) {
      return { modified: 0, exportable: 0 };
    }
    return countFulfillmentModifiedExportable(fulfillmentBranch.items);
  }, [fulfillmentBranch?.items, listTab]);
  const canExportModifiedCsv =
    listTab === "fulfillment" && fulfillmentModifiedCounts.exportable > 0;
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

  const filenameStem = useMemo(
    () =>
      filenameStemOverride ??
      buildPartsSheetExportStem({
        kind: subjectKind,
        subjectId,
        displayName: exportDisplayName,
        branch: listTab,
      }),
    [exportDisplayName, filenameStemOverride, listTab, subjectId, subjectKind]
  );

  const modifiedFilenameStem = useMemo(
    () =>
      modifiedFilenameStemOverride ??
      buildPartsSheetExportStem({
        kind: subjectKind,
        subjectId,
        displayName: exportDisplayName,
        branch: "fulfillment",
        contentLabel: FULFILLMENT_MODIFIED_EXPORT_CONTENT_LABEL,
      }),
    [exportDisplayName, modifiedFilenameStemOverride, subjectId, subjectKind]
  );

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
        gobricksUnitPrice: r.gobricksUnitPrice,
        gdsUnitPrice: r.gdsUnitPrice ?? r.gobricksUnitPrice,
        rest: r.rest,
      })),
      { includeHeader: true }
    );
    downloadText(`${filenameStem}.csv`, text);
  }, [branch, filenameStem]);

  const onExportModifiedCsv = useCallback(() => {
    if (!fulfillmentBranch || fulfillmentBranch.items.length === 0) return;
    setExportError(null);
    const { modified, exportable } = countFulfillmentModifiedExportable(fulfillmentBranch.items);
    if (exportable === 0) {
      setExportError(
        modified > 0
          ? "已修改的行缺少 GDS 商品编号，无法导出修改 CSV。"
          : "当前配货表没有通过「更换零件」修改过的行。"
      );
      return;
    }
    const text = serializeFulfillmentModifiedCsv(fulfillmentBranch.items);
    downloadText(`${modifiedFilenameStem}.csv`, text);
    if (exportable < modified) {
      setExportError(
        `已导出 ${exportable.toLocaleString("zh-CN")} 行；另有 ${(modified - exportable).toLocaleString("zh-CN")} 行缺少 GDS 商品编号已跳过。`
      );
    }
  }, [fulfillmentBranch, modifiedFilenameStem]);

  const onExportXml = useCallback(() => {
    if (!branch || branch.items.length === 0) return;
    setExportError(null);
    const text = serializeBrickLinkInventoryXml(branch.items.map(partsSheetRowToBrickLinkInventoryXmlRow));
    downloadText(`${filenameStem}.xml`, text, "application/xml;charset=utf-8");
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

  const tabLabel =
    listTab === "full" ? "完整零件表" : listTab === "fulfillment" ? "配货表" : "缺件表";

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
        {listTab === "fulfillment" ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-sky-500/35 bg-sky-950/25 px-2.5 py-1 text-xs font-medium leading-none text-sky-100/95 hover:bg-sky-950/45 disabled:opacity-45"
            disabled={!canExportModifiedCsv || exportBusy}
            title={
              fulfillmentModifiedCounts.modified === 0
                ? "配货表中没有通过「更换零件」修改过的行"
                : fulfillmentModifiedCounts.exportable === 0
                  ? "已修改的行均缺少 GDS 商品编号"
                  : `导出 ${fulfillmentModifiedCounts.exportable.toLocaleString("zh-CN")} 行已修改零件；Part 列为 GDS 商品编号（如 GDS-656-072），Color 列为高砖色 ID`
            }
            onClick={onExportModifiedCsv}
          >
            修改 CSV
          </button>
        ) : null}
        <button
          type="button"
          className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium leading-none text-[var(--text)] hover:bg-[var(--surface-3)] disabled:opacity-45"
          disabled={!canExport || exportBusy}
          title={
            !canExport
              ? `当前未选中或未上传${tabLabel}`
              : "导出 BrickLink 心愿单 XML（COLOR 为 BrickLink 色号；列表色 ID 为 Rebrickable，如绿 2→6）"
          }
          onClick={onExportXml}
        >
          XML
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
