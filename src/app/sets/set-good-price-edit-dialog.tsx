"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  clearSetGoodPriceAction,
  saveSetGoodPriceAction,
} from "@/app/sets/set-good-price-actions";
import { hasAnySetGoodPrice } from "@/lib/set-good-price-channel";
import {
  goodPriceBtnDanger,
  goodPriceBtnPrimary,
  goodPriceBtnSecondary,
} from "@/lib/set-good-price-buttons";

export type SetGoodPriceEditDraft = {
  mode: "create" | "edit";
  setNum: string;
  catalogName?: string | null;
  priceNewCny: number | null;
  priceUsedCny: number | null;
};

function priceToInput(v: number | null): string {
  return v != null ? String(v) : "";
}

type Props = {
  draft: SetGoodPriceEditDraft | null;
  onClose: () => void;
};

export function SetGoodPriceEditDialog({ draft, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [setNumInput, setSetNumInput] = useState("");
  const [newInput, setNewInput] = useState("");
  const [usedInput, setUsedInput] = useState("");

  const isEdit = draft?.mode === "edit";
  const hasSaved =
    draft != null && hasAnySetGoodPrice(draft.priceNewCny, draft.priceUsedCny);

  useEffect(() => {
    if (!draft) {
      dialogRef.current?.close();
      return;
    }
    setSetNumInput(draft.setNum);
    setNewInput(priceToInput(draft.priceNewCny));
    setUsedInput(priceToInput(draft.priceUsedCny));
    setError(null);
    dialogRef.current?.showModal();
  }, [draft]);

  const closeDialog = () => {
    dialogRef.current?.close();
    onClose();
  };

  const canSave =
    setNumInput.trim().length > 0 &&
    (newInput.trim().length > 0 || usedInput.trim().length > 0);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveSetGoodPriceAction({
        setNum: setNumInput,
        priceNewCny: newInput,
        priceUsedCny: usedInput,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeDialog();
      router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const res = await clearSetGoodPriceAction({ setNum: setNumInput });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeDialog();
      router.refresh();
    });
  };

  const inputClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm text-[var(--text)] outline-none ring-[var(--accent)]/20 focus-visible:ring-2 w-full";

  return (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-[200] m-0 w-[min(96vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/70"
      aria-labelledby={dialogTitleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      {draft ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={dialogTitleId} className="text-base font-semibold">
                {isEdit ? "编辑好价" : "添加好价"}
              </h3>
              {draft.catalogName?.trim() ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--text)]">{draft.catalogName}</p>
              ) : null}
            </div>
            <button
              type="button"
              className={goodPriceBtnSecondary}
              onClick={closeDialog}
              aria-label="关闭"
            >
              关闭
            </button>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">套装编号 set_num</span>
            <input
              type="text"
              value={setNumInput}
              onChange={(e) => setSetNumInput(e.target.value)}
              readOnly={isEdit}
              disabled={pending || isEdit}
              placeholder="例如 71821 或 71821-1"
              className={`${inputClass} ${isEdit ? "opacity-80" : ""}`}
            />
          </label>

          <p className="text-xs text-[var(--muted)]">
            套装编号可只填数字部分（如 71821），系统会自动匹配目录中的变体（如 71821-1）。
            至少填写全新或二手价格之一。
          </p>

          <div className="flex flex-col gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/50 p-3">
            <p className="text-xs font-medium text-[var(--text)]">全新</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">价格（元）</span>
              <input
                type="text"
                inputMode="decimal"
                value={newInput}
                onChange={(e) => setNewInput(e.target.value)}
                placeholder="选填"
                disabled={pending}
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/50 p-3">
            <p className="text-xs font-medium text-[var(--text)]">二手</p>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--muted)]">价格（元）</span>
              <input
                type="text"
                inputMode="decimal"
                value={usedInput}
                onChange={(e) => setUsedInput(e.target.value)}
                placeholder="选填"
                disabled={pending}
                className={inputClass}
              />
            </label>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2">
            {isEdit && hasSaved ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className={goodPriceBtnDanger}
              >
                删除
              </button>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={pending || !canSave}
              className={goodPriceBtnPrimary}
            >
              {pending ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
