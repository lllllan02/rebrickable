"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { postResolvePartsSheetCsv } from "@/lib/parts-sheet-post-resolve";
import { downloadPartsSheetXlsx } from "@/lib/parts-sheet-xlsx-download";

import {
  type InitialMocSheetFromServer,
  saveBuildPartsSheetToDb,
} from "./moc-parts-sheet-actions";
import { syncGobricksShortageForSubjectAction } from "./gobricks-shortage-sync-action";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";
import { PARTS_SHEET_TAG_LABELS, PARTS_SHEET_TAG_ORDER } from "@/lib/parts-sheet-tags";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";
import { serializeShortageCsv } from "@/lib/serialize-shortage-csv";
import {
  getSheetFilterOptionsFromItems,
  rowMatchesSheetListFilter,
  type SheetListFilter,
} from "@/lib/parts-sheet-list-filter";
import { randomUUID } from "@/lib/random-uuid";

type ShortageRow = ShortageResolveItem & { rowId: string };

type ColorOption = {
  id: number;
  name: string;
  rgb: string;
  isTrans: boolean;
};

function withRowIds(items: ShortageResolveItem[]): ShortageRow[] {
  return items.map((r) => ({ ...r, rowId: randomUUID() }));
}

function rowsToCsv(rows: ShortageRow[], includeHeader: boolean): string {
  return serializeShortageCsv(
    rows.map((r) => ({
      partNum: r.partNum,
      colorId: r.colorId,
      quantity: r.quantity,
      rest: r.rest,
    })),
    { includeHeader }
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob) {
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

function isValidColorPayload(data: unknown): data is { colors: ColorOption[] } {
  if (typeof data !== "object" || data === null || !("colors" in data)) return false;
  const { colors: c } = data as { colors: unknown };
  if (!Array.isArray(c)) return false;
  return c.every(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      "id" in row &&
      typeof (row as { id: unknown }).id === "number" &&
      "name" in row &&
      typeof (row as { name: unknown }).name === "string" &&
      "rgb" in row &&
      typeof (row as { rgb: unknown }).rgb === "string" &&
      "isTrans" in row &&
      typeof (row as { isTrans: unknown }).isTrans === "boolean"
  );
}

type PartsSheetImportProps = {
  /** 写入 `build_saved_parts_sheets` 的 subject_kind */
  buildSubjectKind?: BuildSubjectKind;
  /** 详情页嵌入时：锁定保存到该主体 ID（MOC 数字 ID 或套装 set_num） */
  requestedLoadMocId?: string;
  /** 非详情嵌页：初始化预览数据（若有） */
  initialFullSheet?: InitialMocSheetFromServer | null;
  /** 详情页：已存缺件表 */
  initialShortageSheet?: InitialMocSheetFromServer | null;
  /** 详情页：服务端「标记为不缺」时间戳（ISO），无则 null */
  initialShortageClearedAt?: string | null;
  initialMocLoadError?: string | null;
  /** 嵌在详情页：锁定主体 ID，保存后刷新本页数据 */
  mocDetailEmbed?: boolean;
};

export function PartsSheetImport({
  buildSubjectKind = BUILD_SUBJECT_MOC,
  requestedLoadMocId,
  initialFullSheet,
  initialShortageSheet,
  initialShortageClearedAt = null,
  initialMocLoadError,
  mocDetailEmbed = false,
}: PartsSheetImportProps) {
  const sheetUi = useMemo(() => buildSubjectUi(buildSubjectKind), [buildSubjectKind]);
  const noFullSheetForSet = buildSubjectKind === BUILD_SUBJECT_SET;
  const router = useRouter();
  const clearedByEditRef = useRef(false);
  const [items, setItems] = useState<ShortageRow[] | null>(null);
  const [skippedHeader, setSkippedHeader] = useState(false);
  const [fullItems, setFullItems] = useState<ShortageRow[] | null>(null);
  const [fullSkippedHeader, setFullSkippedHeader] = useState(false);
  const [fullFileName, setFullFileName] = useState<string | null>(null);
  const [shortageItems, setShortageItems] = useState<ShortageRow[] | null>(null);
  const [shortageSkippedHeader, setShortageSkippedHeader] = useState(false);
  const [shortageFileName, setShortageFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineNumber, setLineNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [gobricksBusy, setGobricksBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [colorEditRow, setColorEditRow] = useState<ShortageRow | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<number>(0);
  const [colorFilter, setColorFilter] = useState("");
  const [colorsOptions, setColorsOptions] = useState<ColorOption[] | null>(null);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [colorsLoadError, setColorsLoadError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sheetListFilter, setSheetListFilter] = useState<SheetListFilter>("all");
  const [exportBusy, setExportBusy] = useState(false);
  const [mocLocalMessage, setMocLocalMessage] = useState<string | null>(null);
  const [mocActionBusy, setMocActionBusy] = useState(false);
  const [shortageClearedAtLocal, setShortageClearedAtLocal] = useState<string | null>(() => {
    const t = initialShortageClearedAt;
    return typeof t === "string" && t.trim().length > 0 ? t.trim() : null;
  });
  const mocFeedbackAnchorRef = useRef<HTMLDivElement>(null);
  const [exportProgress, setExportProgress] = useState<{
    jobId: string;
    total: number;
    current: number;
    writingFile: boolean;
  } | null>(null);
  const colorDialogRef = useRef<HTMLDialogElement>(null);
  const imageDialogRef = useRef<HTMLDialogElement>(null);
  const exportProgressDialogRef = useRef<HTMLDialogElement>(null);
  const colorLabelId = useId();
  const imageTitleId = useId();
  const exportProgressTitleId = useId();

  const loadColors = useCallback(async () => {
    setColorsLoading(true);
    setColorsLoadError(null);
    try {
      const res = await fetch("/api/colors");
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !isValidColorPayload(data)) {
        setColorsLoadError("颜色列表加载失败。");
        return;
      }
      setColorsOptions(data.colors);
    } catch {
      setColorsLoadError("颜色列表加载失败。");
    } finally {
      setColorsLoading(false);
    }
  }, []);

  const handleDialogClose = useCallback(() => {
    setColorEditRow(null);
    setSelectedColorId(0);
    setColorFilter("");
  }, []);

  const handleImageDialogClose = useCallback(() => {
    setPreviewUrl(null);
  }, []);

  useEffect(() => {
    if (!colorEditRow) return;
    const d = colorDialogRef.current;
    if (d && !d.open) d.showModal();
  }, [colorEditRow]);

  useEffect(() => {
    if (!colorEditRow) return;
    if (colorsOptions !== null) return;
    void loadColors();
  }, [colorEditRow, colorsOptions, loadColors]);

  useEffect(() => {
    if (!previewUrl) return;
    const d = imageDialogRef.current;
    if (d && !d.open) d.showModal();
  }, [previewUrl]);

  useEffect(() => {
    if (!exportProgress) return;
    const d = exportProgressDialogRef.current;
    if (d && !d.open) d.showModal();
  }, [exportProgress]);

  const openColorDialog = useCallback((row: ShortageRow) => {
    setColorFilter("");
    setSelectedColorId(row.colorId);
    setColorEditRow(row);
  }, []);

  const filteredColors = useMemo(() => {
    if (!colorsOptions) return [];
    const raw = colorFilter.trim().toLowerCase();
    if (!raw) return colorsOptions;
    const forRgb = raw.replace(/^#/, "");
    return colorsOptions.filter(
      (c) =>
        String(c.id).includes(forRgb) ||
        c.name.toLowerCase().includes(raw) ||
        c.rgb.toLowerCase().includes(forRgb)
    );
  }, [colorFilter, colorsOptions]);

  /** MOC 反馈区滚入视口，以免自动保存后「没反应」 */
  const scrollMocFeedbackIntoView = useCallback(() => {
    setTimeout(() => {
      mocFeedbackAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }, []);

  const saveSheetToMocDbCore = useCallback(
    async (
      id: string,
      rows: ShortageRow[],
      nextSkippedHeader: boolean,
      sourceFileName: string | null,
      kind: "full" | "shortage"
    ): Promise<boolean> => {
      const trimmed = id.trim();
      if (!trimmed || rows.length === 0) return false;
      if (buildSubjectKind === BUILD_SUBJECT_SET && kind === "full") {
        setError("套装不支持上传完整零件表，清单以本地官方库存为准。");
        setLineNumber(null);
        scrollMocFeedbackIntoView();
        return false;
      }
      setMocLocalMessage(null);
      setMocActionBusy(true);
      try {
        const result = await saveBuildPartsSheetToDb({
          subjectKind: buildSubjectKind,
          subjectId: trimmed,
          kind,
          skippedHeader: nextSkippedHeader,
          sourceFileName,
          items: rows.map(({ rowId, ...rest }) => {
            void rowId;
            return rest;
          }),
        });
        if (!result.ok) {
          setError(result.error);
          setLineNumber(null);
          scrollMocFeedbackIntoView();
          return false;
        }
        setError(null);
        setLineNumber(null);
        router.refresh();
        setMocLocalMessage(
          kind === "full"
            ? "已保存完整零件表；下方列表在对应 Tab 下刷新。"
            : "已保存缺件表；下方列表在对应 Tab 下刷新。"
        );
        scrollMocFeedbackIntoView();
        return true;
      } catch {
        setError("保存失败，请重试。");
        setLineNumber(null);
        scrollMocFeedbackIntoView();
        return false;
      } finally {
        setMocActionBusy(false);
      }
    },
    [buildSubjectKind, router, scrollMocFeedbackIntoView]
  );

  const onFile = useCallback(
    async (file: File | null, sheetKind?: "full" | "shortage") => {
      setError(null);
      setLineNumber(null);
      if (!mocDetailEmbed) {
        setItems(null);
        setFileName(null);
      } else {
        if (sheetKind === "full") {
          setFullItems(null);
          setFullFileName(null);
        } else if (sheetKind === "shortage") {
          setShortageItems(null);
          setShortageFileName(null);
        }
      }
      clearedByEditRef.current = false;
      if (!file) return;

      if (noFullSheetForSet && sheetKind === "full") {
        setError("套装不支持上传完整零件表，清单以本地官方库存为准。");
        setLineNumber(null);
        return;
      }

      setLoading(true);
      const kind = mocDetailEmbed ? (sheetKind ?? "full") : "full";
      if (mocDetailEmbed) {
        if (kind === "full") setFullFileName(file.name);
        else setShortageFileName(file.name);
      } else {
        setFileName(file.name);
      }
      try {
        const csv = await file.text();
        const result = await postResolvePartsSheetCsv(csv);
        if ("error" in result && result.error) {
          setError(result.error);
          setLineNumber(result.lineNumber ?? null);
          return;
        }
        setSheetListFilter("all");
        const rows = withRowIds(result.items);
        if (mocDetailEmbed) {
          if (kind === "full") {
            setFullSkippedHeader(result.skippedHeader);
            setFullItems(rows);
          } else {
            setShortageSkippedHeader(result.skippedHeader);
            setShortageItems(rows);
          }
          const mid = (requestedLoadMocId ?? "").trim();
          if (mid) {
            const okSave = await saveSheetToMocDbCore(mid, rows, result.skippedHeader, file.name, kind);
            if (okSave && kind === "full" && !noFullSheetForSet) {
              setGobricksBusy(true);
              try {
                const sync = await syncGobricksShortageForSubjectAction({
                  subjectKind: buildSubjectKind,
                  subjectId: mid,
                });
                if (sync.ok) {
                  setMocLocalMessage(sync.message);
                  setError(null);
                  setLineNumber(null);
                  router.refresh();
                } else {
                  setError(sync.error);
                }
              } finally {
                setGobricksBusy(false);
              }
            }
          }
        } else {
          setSkippedHeader(result.skippedHeader);
          setItems(rows);
        }
      } catch {
        setError("读取或上传失败，请重试。");
      } finally {
        setLoading(false);
      }
    },
    [buildSubjectKind, mocDetailEmbed, noFullSheetForSet, requestedLoadMocId, router, saveSheetToMocDbCore]
  );

  const fetchShortageFromGobricks = useCallback(async () => {
    if (!mocDetailEmbed) return;
    const mid = (requestedLoadMocId ?? "").trim();
    if (!noFullSheetForSet && !fullItems?.length) {
      setError("请先在当前页上传并解析完整零件表（或从服务器加载完整表）后再试。");
      setLineNumber(null);
      return;
    }
    if (!mid) {
      setError("主体 ID 无效。");
      setLineNumber(null);
      return;
    }

    setError(null);
    setLineNumber(null);
    setMocLocalMessage(null);
    setGobricksBusy(true);
    try {
      const sync = await syncGobricksShortageForSubjectAction({
        subjectKind: buildSubjectKind,
        subjectId: mid,
      });
      if (!sync.ok) {
        setError(sync.error);
        return;
      }
      setMocLocalMessage(sync.message);
      setShortageFileName("高砖缺件查询.csv");
      router.refresh();
    } catch {
      setError("从高砖获取缺件表失败，请重试。");
    } finally {
      setGobricksBusy(false);
    }
  }, [buildSubjectKind, fullItems, mocDetailEmbed, noFullSheetForSet, requestedLoadMocId, router]);

  const applyColorChange = useCallback(async () => {
    const editing = colorEditRow;
    if (!editing || !items) return;
    if (!Number.isFinite(selectedColorId) || selectedColorId < 0) {
      setError("请从列表中选择颜色。");
      setLineNumber(null);
      return;
    }
    if (selectedColorId === editing.colorId) {
      colorDialogRef.current?.close();
      return;
    }

    const nextRows: ShortageRow[] = items.map((r) =>
      r.rowId === editing.rowId ? { ...r, colorId: selectedColorId } : r
    );
    const csv = rowsToCsv(nextRows, skippedHeader);
    setLoading(true);
    setError(null);
    setLineNumber(null);
    colorDialogRef.current?.close();
    try {
      const result = await postResolvePartsSheetCsv(csv);
      if ("error" in result && result.error) {
        setError(result.error);
        setLineNumber(result.lineNumber ?? null);
        return;
      }
      const prevIds = nextRows.map((r) => r.rowId);
      setSkippedHeader(result.skippedHeader);
      const mapped = result.items.map((r, i) => ({
        ...r,
        rowId: prevIds[i] ?? randomUUID(),
      }));
      setItems(mapped);
    } catch {
      setError("更新颜色后重新解析失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, [colorEditRow, items, selectedColorId, skippedHeader]);

  const exportStem = useMemo(
    () => (fileName?.replace(/\.csv$/i, "") ?? "parts-sheet") + "-edited",
    [fileName]
  );

  useEffect(() => {
    const qid = requestedLoadMocId?.trim();
    if (!qid) return;

    setLineNumber(null);
    setMocLocalMessage(null);

    if (initialMocLoadError) {
      setError(initialMocLoadError);
      if (mocDetailEmbed) {
        setFullItems(null);
        setShortageItems(null);
        setShortageClearedAtLocal(null);
      } else {
        setItems(null);
      }
      scrollMocFeedbackIntoView();
      return;
    }

    if (mocDetailEmbed) {
      clearedByEditRef.current = false;
      setError(null);
      if (!noFullSheetForSet && initialFullSheet && initialFullSheet.subjectId === qid) {
        setFullSkippedHeader(initialFullSheet.skippedHeader);
        setFullItems(withRowIds(initialFullSheet.items));
        setFullFileName(`${sheetUi.exportFilenameStem(qid, "full").replace(/-edited$/, "")}.csv`);
      } else {
        setFullItems(null);
        setFullFileName(null);
      }
      if (initialShortageSheet && initialShortageSheet.subjectId === qid) {
        setShortageSkippedHeader(initialShortageSheet.skippedHeader);
        setShortageItems(withRowIds(initialShortageSheet.items));
        setShortageFileName(`${sheetUi.exportFilenameStem(qid, "shortage").replace(/-edited$/, "")}.csv`);
      } else {
        setShortageItems(null);
        setShortageFileName(null);
      }
      const cleared =
        typeof initialShortageClearedAt === "string" && initialShortageClearedAt.trim().length > 0
          ? initialShortageClearedAt.trim()
          : null;
      setShortageClearedAtLocal(cleared);
      return;
    }

    if (initialFullSheet && initialFullSheet.subjectId === qid) {
      clearedByEditRef.current = false;
      setError(null);
      setSkippedHeader(initialFullSheet.skippedHeader);
      setSheetListFilter("all");
      setItems(withRowIds(initialFullSheet.items));
      setFileName(`${sheetUi.exportFilenameStem(qid, "full").replace(/-full-edited$/, "")}.csv`);
    }
  }, [
    buildSubjectKind,
    requestedLoadMocId,
    initialFullSheet,
    initialShortageSheet,
    initialShortageClearedAt,
    initialMocLoadError,
    mocDetailEmbed,
    noFullSheetForSet,
    scrollMocFeedbackIntoView,
    sheetUi,
  ]);

  const onExportCsv = useCallback(() => {
    if (!items || items.length === 0) return;
    const text = rowsToCsv(items, skippedHeader);
    downloadText(`${exportStem}.csv`, text);
  }, [exportStem, items, skippedHeader]);

  const onExportXlsx = useCallback(async () => {
    if (!items || items.length === 0) return;
    setExportBusy(true);
    setError(null);
    setLineNumber(null);
    const stripped = items.map(({ rowId, ...rest }) => {
      void rowId;
      return rest;
    });
    setExportProgress({
      jobId: "export",
      total: stripped.length,
      current: 0,
      writingFile: false,
    });
    try {
      const result = await downloadPartsSheetXlsx(stripped, exportStem, (p) => {
        setExportProgress((prev) =>
          prev ? { ...prev, current: p.current, total: p.total, writingFile: p.writingFile } : prev
        );
      });
      if (!result.ok) {
        setError(result.error);
      }
    } catch {
      setError("导出 Excel 失败，请重试。");
    } finally {
      exportProgressDialogRef.current?.close();
      setExportProgress(null);
      setExportBusy(false);
    }
  }, [exportStem, items]);

  const missingParts = items?.filter((i) => !i.partFound).length ?? 0;
  const noImage = items?.filter((i) => i.partFound && !i.imgUrl).length ?? 0;

  const sheetFilterOptions = useMemo(() => getSheetFilterOptionsFromItems(items ?? []), [items]);

  useEffect(() => {
    if (sheetListFilter === "all") return;
    const ids = new Set(sheetFilterOptions.map((o) => o.id));
    if (!ids.has(sheetListFilter)) setSheetListFilter("all");
  }, [sheetListFilter, sheetFilterOptions]);

  const listFiltered = useMemo(() => {
    if (!items?.length) return [];
    return items.filter((r) => rowMatchesSheetListFilter(r, sheetListFilter));
  }, [items, sheetListFilter]);

  const exportBarPercent =
    exportProgress === null
      ? 0
      : exportProgress.writingFile
        ? 97
        : exportProgress.total > 0
          ? Math.min(
              94,
              Math.round((exportProgress.current / exportProgress.total) * 94)
            )
          : 0;

  return (
    <div className={mocDetailEmbed ? "space-y-4" : "space-y-6"}>
      <dialog
        ref={imageDialogRef}
        className="fixed left-1/2 top-1/2 z-[200] m-0 max-h-[min(92vh,56rem)] max-w-[min(96vw,56rem)] w-[min(96vw,56rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/70"
        aria-labelledby={imageTitleId}
        onClose={handleImageDialogClose}
        onClick={(e) => {
          if (e.target === e.currentTarget) imageDialogRef.current?.close();
        }}
      >
        {previewUrl ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p id={imageTitleId} className="text-sm font-medium">
                图片预览
              </p>
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-2)]"
                onClick={() => imageDialogRef.current?.close()}
              >
                关闭
              </button>
            </div>
            <Image
              src={previewUrl}
              alt=""
              width={960}
              height={960}
              unoptimized
              className="mx-auto max-h-[min(85vh,900px)] w-auto max-w-full object-contain"
            />
          </div>
        ) : null}
      </dialog>

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
              导出 Excel
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

      <dialog
        ref={colorDialogRef}
        className="fixed left-1/2 top-1/2 z-[200] m-0 max-h-[min(92vh,40rem)] w-[min(100vw-1.5rem,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/55"
        aria-labelledby={colorLabelId}
        onClose={handleDialogClose}
      >
        {colorEditRow ? (
          <form
            className="flex max-h-[min(88vh,38rem)] flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void applyColorChange();
            }}
          >
            <h2 id={colorLabelId} className="text-sm font-semibold">
              更换颜色
            </h2>
            <p className="text-xs text-[var(--muted)]">
              零件{" "}
              <span className="font-mono text-[var(--text)]">{colorEditRow.partNum}</span>
              ，请从库中选择颜色；也可打开{" "}
              <Link href="/colors" className="underline">
                颜色表
              </Link>{" "}
              对照色块。
            </p>
            {colorsLoadError ? (
              <div className="rounded-md border border-red-400/25 bg-[var(--danger-soft)] px-3 py-2 text-xs text-red-200/95">
                <p>{colorsLoadError}</p>
                <button
                  type="button"
                  className="mt-2 text-[var(--accent)] underline"
                  onClick={() => void loadColors()}
                >
                  重试
                </button>
              </div>
            ) : null}
            <label className="block shrink-0 text-xs text-[var(--muted)]">
              筛选
              <input
                type="search"
                value={colorFilter}
                onChange={(e) => setColorFilter(e.target.value)}
                placeholder="名称、ID 或 RGB…"
                className="field mt-1 w-full text-sm"
                disabled={colorsLoading || !colorsOptions}
              />
            </label>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]">
              {colorsLoading && !colorsOptions ? (
                <p className="p-4 text-center text-sm text-[var(--muted)]">加载颜色中…</p>
              ) : colorsOptions ? (
                <ul
                  className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-contain p-1.5"
                  role="listbox"
                  aria-label="颜色列表"
                >
                  {filteredColors.length === 0 ? (
                    <li className="px-2 py-4 text-center text-sm text-[var(--muted)]">无匹配项</li>
                  ) : (
                    filteredColors.map((c) => {
                      const active = c.id === selectedColorId;
                      return (
                        <li key={c.id} className="py-0.5">
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm transition-colors ${
                              active
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                                : "border-transparent text-[var(--text)] hover:bg-[var(--surface-3)]"
                            }`}
                            onClick={() => setSelectedColorId(c.id)}
                          >
                            <span
                              className="color-swatch h-6 w-9 shrink-0 rounded-sm border border-[var(--border)]"
                              style={{ background: `#${c.rgb}` }}
                            />
                            <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{c.id}</span>
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            {c.isTrans ? (
                              <span className="shrink-0 text-[10px] text-[var(--muted)]">透明</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--border-soft)] pt-3">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
                onClick={() => colorDialogRef.current?.close()}
              >
                取消
              </button>
              <button
                type="submit"
                className="button-primary text-sm"
                disabled={
                  loading ||
                  colorsLoading ||
                  !colorsOptions ||
                  Boolean(colorsLoadError) ||
                  selectedColorId === colorEditRow.colorId
                }
              >
                应用并刷新
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

      <div
        className={
          mocDetailEmbed
            ? "flex flex-wrap items-center gap-x-3 gap-y-2"
            : "filter-bar flex-wrap items-center gap-3"
        }
      >
        {mocDetailEmbed ? (
          <>
            {!noFullSheetForSet ? (
              <label className="button-primary cursor-pointer text-sm">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={loading || gobricksBusy || mocActionBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void onFile(f, "full");
                    e.target.value = "";
                  }}
                />
                {loading ? "解析中…" : "上传完整零件表 CSV"}
              </label>
            ) : null}
            <span className="inline-flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="button-primary text-sm disabled:cursor-not-allowed disabled:opacity-45"
                disabled={
                  loading ||
                  gobricksBusy ||
                  mocActionBusy ||
                  (!noFullSheetForSet && !(fullItems?.length))
                }
                title={
                  !noFullSheetForSet && !(fullItems?.length)
                    ? "请先上传并保存完整零件表，或从服务器加载完整表"
                    : undefined
                }
                onClick={() => void fetchShortageFromGobricks()}
              >
                {gobricksBusy ? "查询中…" : "从高砖获取缺件表"}
              </button>
            </span>
          </>
        ) : (
          <label className="button-primary cursor-pointer text-sm">
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={loading || mocActionBusy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                void onFile(f);
                e.target.value = "";
              }}
            />
            {loading ? "解析中…" : "选择零件表 CSV"}
          </label>
        )}
        {!mocDetailEmbed && items !== null && items.length > 0 ? (
          <>
            <button
              type="button"
              className="button-primary text-sm"
              disabled={loading || exportBusy || mocActionBusy}
              onClick={() => void onExportXlsx()}
            >
              {exportBusy ? "导出中…" : "导出 Excel（含缩略图）"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
              disabled={loading || exportBusy || mocActionBusy}
              onClick={onExportCsv}
            >
              导出 CSV（无图，可再导入）
            </button>
          </>
        ) : null}
        {mocDetailEmbed ? (
          <span className="max-w-full text-xs leading-relaxed text-[var(--muted)]">
            {!noFullSheetForSet ? (
              <>
                完整表 {fullItems ? `${fullItems.length.toLocaleString("zh-CN")} 行` : "未上传"}
                {fullFileName ? `（${fullFileName}）` : ""}
                {" · "}
              </>
            ) : null}
            缺件表 {shortageItems ? `${shortageItems.length.toLocaleString("zh-CN")} 行` : "未上传"}
            {shortageFileName ? `（${shortageFileName}）` : ""}
            。导出请使用下方列表旁的按钮。
            {shortageClearedAtLocal?.trim() && !(shortageItems?.length) ? (
              <>
                {" "}
                当前为「不缺件」；若要再次记录缺件，请使用「从高砖获取缺件表」。
              </>
            ) : null}
          </span>
        ) : fileName ? (
          <span className="text-xs text-[var(--muted)]">{fileName}</span>
        ) : null}
      </div>

      <div ref={mocFeedbackAnchorRef} className="space-y-2 scroll-mt-24">
        {mocLocalMessage ? (
          <div
            className="rounded-[var(--radius-md)] border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-[var(--text)]"
            role="status"
          >
            {mocLocalMessage.includes("\n\n") ? (
              mocLocalMessage.split("\n\n").map((paragraph, i) => (
                <p
                  key={i}
                  className={
                    i === 0
                      ? "font-medium text-emerald-100/95"
                      : "mt-2 text-[13px] leading-relaxed text-emerald-100/85"
                  }
                >
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="font-medium text-emerald-100/95">{mocLocalMessage}</p>
            )}
          </div>
        ) : null}

        {error ? (
          <div
            className="rounded-[var(--radius-md)] border border-red-400/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--text)]"
            role="alert"
          >
            <p className="font-medium text-red-200/95">{error}</p>
            {lineNumber !== null ? (
              <p className="mt-1 text-xs text-[var(--muted)]">
                出错行号：{lineNumber}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {items !== null && items.length === 0 && !error ? (
        <p className="text-sm text-[var(--muted)]">
          {clearedByEditRef.current ? (
            <>已将列表清空。可重新选择 CSV 导入，或关闭本页。</>
          ) : (
            <>
              文件中没有数据行（仅表头或空文件）。
              {skippedHeader ? " 已跳过表头。" : ""}
            </>
          )}
        </p>
      ) : null}

      {!mocDetailEmbed && items !== null && items.length > 0 ? (
        <>
          <div className="meta-row flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--muted)]">
            <span>
              共 {items.length} 条
              {sheetListFilter !== "all" && listFiltered.length !== items.length
                ? `，当前筛选 ${listFiltered.length} 条`
                : null}
            </span>
            {sheetFilterOptions.length > 1 ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="text-[var(--muted-2)]">分类：</span>
                {sheetFilterOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                      sheetListFilter === opt.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                        : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                    }`}
                    onClick={() => setSheetListFilter(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </span>
            ) : null}
            {skippedHeader ? (
              <span>导出 CSV 时将保留表头行；Excel 前四列与 CSV 表头一致（Part, Color, Quantity, Rest）</span>
            ) : null}
            {missingParts > 0 ? (
              <span className="text-amber-200/90">
                本地库未收录：{missingParts} 条
              </span>
            ) : null}
            {noImage > 0 ? (
              <span>有收录但无库存图：{noImage} 条</span>
            ) : null}
          </div>
          {listFiltered.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              当前分类下没有匹配条目。未收录零件不会参与分类筛选；可点「全部」查看完整列表。
            </p>
          ) : (
            <ul className="content-grid">
            {listFiltered.map((r) => (
              <li key={r.rowId} className="result-card">
                <div className="media-box media-box-sm">
                  {r.imgUrl ? (
                    <button
                      type="button"
                      className="flex h-full w-full cursor-zoom-in items-center justify-center border-0 bg-transparent p-0"
                      title="点击放大预览"
                      aria-label={`放大预览 ${r.partNum} 零件图`}
                      onClick={() => setPreviewUrl(r.imgUrl!)}
                    >
                      <Image
                        src={r.imgUrl}
                        alt=""
                        width={56}
                        height={56}
                        className="box-border h-full w-full object-contain p-0.5"
                        sizes="56px"
                      />
                    </button>
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-[9px] leading-tight text-[var(--muted)]"
                      title={r.partFound ? "库存中暂无图片" : "零件未收录"}
                    >
                      {r.partFound ? "无图" : "?"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        {r.partFound ? (
                          <Link
                            href={`/parts/${encodeURIComponent(r.partNum)}`}
                            className="font-mono text-xs font-semibold text-[var(--accent)] sm:text-[13px]"
                          >
                            {r.partNum}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-amber-200/90 sm:text-[13px]">
                            {r.partNum}
                          </span>
                        )}
                        <button
                          type="button"
                          className="badge cursor-pointer border-0 bg-[var(--surface-3)] text-left hover:ring-1 hover:ring-[var(--accent)]/40"
                          title="点击更换颜色（将重新匹配缩略图与颜色名）"
                          disabled={loading || exportBusy || mocActionBusy}
                          onClick={() => openColorDialog(r)}
                        >
                          色 {r.colorId}
                          {r.colorName ? ` · ${r.colorName}` : ""}
                        </button>
                        <span className="badge badge-accent">×{r.quantity}</span>
                        {r.imgSource === "part" ? (
                          <span
                            className="text-[10px] text-[var(--muted)]"
                            title="当前颜色无库存图，已使用该零件其他颜色的图片"
                          >
                            图·异色
                          </span>
                        ) : null}
                        {r.partFound
                          ? PARTS_SHEET_TAG_ORDER.filter((t) => r.sheetTags.includes(t)).map((t) => (
                              <span
                                key={t}
                                className="rounded border border-amber-400/35 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-100/95"
                                title={
                                  t === "printed"
                                    ? "在零件关系表中为印刷子件（rel_type P）"
                                    : t === "minifig"
                                      ? "零件大类名含 Minifig（Rebrickable 分类）"
                                      : "零件大类名含 Sticker"
                                }
                              >
                                {PARTS_SHEET_TAG_LABELS[t]}
                              </span>
                            ))
                          : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--text)]">
                        {r.partFound && r.partName ? (
                          <>
                            {r.partName}
                            {r.partCatName ? (
                              <span className="text-[var(--muted)]"> · {r.partCatName}</span>
                            ) : null}
                          </>
                        ) : r.partFound ? (
                          <span className="text-[var(--muted)]">（无名称）</span>
                        ) : (
                          <span className="text-amber-200/85">
                            本地库中无此 part_num，请核对导出或导入数据。
                          </span>
                        )}
                      </p>
                      {r.rest ? (
                        <p className="meta-row mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
                          {r.rest}
                        </p>
                      ) : null}
                      {r.partFound && !r.elementKnown ? (
                        <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                          提示：elements 表中无此零件+颜色组合（图片仍可能来自库存抽样）。
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
