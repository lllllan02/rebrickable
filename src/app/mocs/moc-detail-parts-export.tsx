"use client";

import { useCallback, useMemo } from "react";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";
import { buildPartsSheetExportStem } from "@/lib/parts-sheet-export-filename";
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
  /** 覆盖默认文件名主体 */
  filenameStemOverride?: string;
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
  filenameStemOverride,
}: Props) {
  const branchFromInitial =
    listTab === "full" ? initialFull : listTab === "shortage" ? initialShortage : initialFulfillment;
  const branch = activeSheet ?? toExportSource(branchFromInitial);

  const canExport = Boolean(branch && branch.items.length > 0);

  const filenameStem = useMemo(
    () =>
      filenameStemOverride ??
      buildPartsSheetExportStem({
        kind: subjectKind,
        subjectId,
        displayName: exportDisplayName,
        branch: listTab,
      }),
    [exportDisplayName, filenameStemOverride, listTab, subjectId, subjectKind],
  );

  const tabLabel =
    listTab === "full" ? "完整零件表" : listTab === "fulfillment" ? "配货表" : "缺件表";

  const onExportCsv = useCallback(() => {
    if (!branch || branch.items.length === 0) return;
    const text = serializeShortageCsv(
      branch.items.map((r) => ({
        partNum: r.partNum,
        colorId: r.colorId,
        elementId: r.elementId,
        quantity: r.quantity,
        gobricksUnitPrice: r.gobricksUnitPrice,
        gdsUnitPrice: r.gdsUnitPrice ?? r.gobricksUnitPrice,
        rest: r.rest,
      })),
      { includeHeader: true },
    );
    downloadText(`${filenameStem}.csv`, text);
  }, [branch, filenameStem]);

  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-1 sm:w-auto">
      <div className="inline-flex max-w-full flex-nowrap items-center gap-1.5">
        <span className="hidden shrink-0 text-[10px] text-[var(--muted-2)] sm:inline">
          「{tabLabel}」
        </span>
        <button
          type="button"
          className="button-primary shrink-0 rounded-md !py-1 !px-2.5 text-xs font-semibold leading-none disabled:opacity-45"
          disabled={!canExport}
          title={!canExport ? `当前未选中或未上传${tabLabel}` : "导出 CSV（可再导入）"}
          onClick={onExportCsv}
        >
          CSV
        </button>
      </div>
      <p className="text-right text-[10px] text-[var(--muted)] sm:hidden">导出「{tabLabel}」</p>
    </div>
  );
}
