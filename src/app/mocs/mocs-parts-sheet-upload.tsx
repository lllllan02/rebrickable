"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  mocHasSavedPartsSheet,
  saveMocPartsSheetToDb,
} from "@/app/mocs/moc-parts-sheet-actions";
import { parseMocIdFromFilename } from "@/lib/parts-sheet-moc-id";
import { postResolvePartsSheetCsv } from "@/lib/parts-sheet-post-resolve";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type PendingPayload = {
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  fileName: string;
};

export function MocsPartsSheetUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [parseBusy, setParseBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingPayload | null>(null);
  const [mocIdInput, setMocIdInput] = useState("");
  const [step, setStep] = useState<"confirm" | "duplicate">("confirm");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, [pending]);

  const closeDialog = useCallback(() => {
    dialogRef.current?.close();
    setPending(null);
    setMocIdInput("");
    setStep("confirm");
    setModalError(null);
    setModalBusy(false);
  }, []);

  const performImportSave = useCallback(async () => {
    if (!pending) return;
    const mocId = mocIdInput.trim();
    if (!mocId) {
      setModalError("请填写 MOC ID。");
      return;
    }
    setModalError(null);
    try {
      const result = await saveMocPartsSheetToDb({
        mocId,
        skippedHeader: pending.skippedHeader,
        sourceFileName: pending.fileName,
        items: pending.items,
      });
      if (!result.ok) {
        setModalError(result.error);
        return;
      }
      closeDialog();
      router.push(`/mocs/${encodeURIComponent(mocId)}`);
    } catch {
      setModalError("保存失败，请重试。");
    }
  }, [closeDialog, mocIdInput, pending, router]);

  const onConfirmImport = useCallback(async () => {
    const mocId = mocIdInput.trim();
    if (!mocId) {
      setModalError("请填写 MOC ID。");
      return;
    }
    setModalError(null);
    setModalBusy(true);
    try {
      const exists = await mocHasSavedPartsSheet(mocId);
      if (exists) {
        setStep("duplicate");
        return;
      }
      await performImportSave();
    } catch {
      setModalError("检查已存记录失败，请重试。");
    } finally {
      setModalBusy(false);
    }
  }, [mocIdInput, performImportSave]);

  const onOverwriteSave = useCallback(async () => {
    setModalBusy(true);
    try {
      await performImportSave();
    } finally {
      setModalBusy(false);
    }
  }, [performImportSave]);

  const onPick = useCallback(
    async (file: File | null) => {
      setParseError(null);
      if (!file) return;
      setParseBusy(true);
      try {
        const csv = await file.text();
        const result = await postResolvePartsSheetCsv(csv);
        if (result.error) {
          setParseError(result.error);
          return;
        }
        if (!result.items.length) {
          setParseError("文件中没有有效数据行。");
          return;
        }
        setStep("confirm");
        setModalError(null);
        setMocIdInput(parseMocIdFromFilename(file.name) ?? "");
        setPending({
          skippedHeader: result.skippedHeader,
          items: result.items,
          fileName: file.name,
        });
      } catch {
        setParseError("读取或解析失败，请重试。");
      } finally {
        setParseBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    []
  );

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="button-primary cursor-pointer text-sm">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={parseBusy}
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
          />
          {parseBusy ? "解析中…" : "上传零件表 CSV"}
        </label>
        <p className="max-w-xl text-xs leading-relaxed text-[var(--muted)]">
          与{" "}
          <code className="rounded bg-[var(--surface-3)] px-1 py-px font-mono text-[11px]">
            rebrickable_parts_*_缺货表.csv
          </code>{" "}
          结构一致；解析成功后在本页确认 MOC ID 并写入数据库。若该 ID 已有零件表，将询问是否覆盖。
        </p>
      </div>
      {parseError ? <p className="mt-2 text-xs text-red-200/90">{parseError}</p> : null}

      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 z-[200] m-0 w-[min(100vw-1.5rem,22rem)] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/55"
        aria-labelledby={titleId}
        onClose={closeDialog}
      >
        {pending ? (
          <div className="flex flex-col gap-3">
            <h2 id={titleId} className="text-sm font-semibold">
              {step === "confirm" ? "确认导入" : "MOC ID 已存在"}
            </h2>
            {step === "confirm" ? (
              <>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  文件 <span className="font-mono text-[var(--text)]">{pending.fileName}</span>，共{" "}
                  <span className="tabular-nums text-[var(--text)]">{pending.items.length}</span>{" "}
                  行。请填写或核对 Rebrickable 数字 MOC ID 后导入。
                </p>
                <label className="text-xs text-[var(--muted)]">
                  MOC ID
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mocIdInput}
                    onChange={(e) => {
                      setMocIdInput(e.target.value);
                      setModalError(null);
                    }}
                    placeholder="如 12345"
                    className="field mt-1 w-full font-mono text-sm text-[var(--text)]"
                    autoComplete="off"
                  />
                </label>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-[var(--muted)]">
                本地库中已有 MOC{" "}
                <span className="font-mono text-[var(--text)]">{mocIdInput.trim()}</span>{" "}
                的零件表。覆盖将替换为本次 CSV 解析结果，且无法撤销。
              </p>
            )}
            {modalError ? (
              <p className="rounded-md border border-red-400/25 bg-[var(--danger-soft)] px-2 py-1.5 text-xs text-red-200/95">
                {modalError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border-soft)] pt-3">
              {step === "duplicate" ? (
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
                  disabled={modalBusy}
                  onClick={() => {
                    setStep("confirm");
                    setModalError(null);
                  }}
                >
                  返回修改
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
                disabled={modalBusy}
                onClick={closeDialog}
              >
                取消
              </button>
              {step === "confirm" ? (
                <button
                  type="button"
                  className="button-primary text-sm"
                  disabled={modalBusy}
                  onClick={() => void onConfirmImport()}
                >
                  {modalBusy ? "处理中…" : "导入"}
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary text-sm"
                  disabled={modalBusy}
                  onClick={() => void onOverwriteSave()}
                >
                  {modalBusy ? "保存中…" : "覆盖并保存"}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
