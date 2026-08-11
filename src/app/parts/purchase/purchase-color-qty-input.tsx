"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { QtySpinInput } from "@/components/qty-spin-input";
import {
  setPurchaseListColorQuantityAction,
  transferPurchaseColorToOwnedAction,
} from "@/app/parts/purchase/purchase-list-actions";

type Props = {
  partNum: string;
  colorId: number;
  initialQuantity: number;
  className?: string;
};

function displayValue(qty: number): string {
  return qty > 0 ? String(qty) : "";
}

/** 零件详情：某色待购数量 + 转入库存 */
export function PurchaseColorQtyInput({
  partNum,
  colorId,
  initialQuantity,
  className = "",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(displayValue(initialQuantity));
  const [savedQty, setSavedQty] = useState(
    Math.max(0, Math.floor(initialQuantity))
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = Math.max(0, Math.floor(initialQuantity));
    setSavedQty(next);
    setValue(displayValue(next));
    setError(null);
  }, [initialQuantity, partNum, colorId]);

  function persist(nextQty: number) {
    if (nextQty === savedQty) {
      setValue(displayValue(savedQty));
      setError(null);
      return;
    }

    const prev = savedQty;
    setSavedQty(nextQty);
    setValue(displayValue(nextQty));
    setError(null);

    startTransition(async () => {
      const res = await setPurchaseListColorQuantityAction({
        partNum,
        colorId,
        quantity: nextQty,
      });
      if (!res.ok) {
        setSavedQty(prev);
        setValue(displayValue(prev));
        setError(res.error);
        return;
      }
      setSavedQty(res.quantity);
      setValue(displayValue(res.quantity));
      router.refresh();
    });
  }

  function commit() {
    const trimmed = value.trim();
    let nextQty: number;
    if (trimmed === "") {
      nextQty = 0;
    } else {
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== trimmed) {
        setError("请输入非负整数");
        setValue(displayValue(savedQty));
        return;
      }
      nextQty = parsed;
    }
    persist(nextQty);
  }

  function step(delta: 1 | -1) {
    persist(Math.max(0, savedQty + delta));
  }

  function transfer() {
    if (savedQty <= 0) return;
    setError(null);
    startTransition(async () => {
      const res = await transferPurchaseColorToOwnedAction({
        partNum,
        colorId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedQty(0);
      setValue("");
      router.refresh();
    });
  }

  return (
    <div
      className={`flex shrink-0 flex-col items-end gap-1 ${className}`.trim()}
    >
      <div className="flex items-start gap-1">
        <div className="inline-flex flex-col items-center gap-0.5">
          <span className="text-[9px] leading-none text-[var(--muted)]">待购</span>
          <QtySpinInput
            value={value}
            disabled={pending}
            placeholder="0"
            title="待购数量（需绑定颜色）"
            aria-label="待购数量"
            canDecrement={savedQty > 0}
            onChange={(digits) => {
              setValue(digits);
              if (error) setError(null);
            }}
            onCommit={commit}
            onStep={step}
          />
        </div>
        <div className="inline-flex flex-col items-center gap-0.5">
          <span className="invisible text-[9px] leading-none" aria-hidden>
            ·
          </span>
          <button
            type="button"
            disabled={pending || savedQty <= 0}
            title={savedQty > 0 ? "转入零件库" : "请先填写待购数量"}
            aria-label="转入零件库"
            className={`group inline-flex h-7 w-7 items-center justify-center rounded-full border transition-[transform,background-color,border-color,color] active:scale-95 disabled:cursor-not-allowed ${
              savedQty > 0
                ? "border-[var(--accent)]/55 bg-[var(--accent-soft)] text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/25"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted-2)]"
            } ${pending ? "opacity-50" : ""}`}
            onClick={transfer}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden
              className={`translate-x-px ${
                savedQty > 0
                  ? "transition-transform group-hover:translate-x-0.5"
                  : ""
              }`}
            >
              <path
                d="M3 8h8.5M8.5 4.5 12.5 8l-4 3.5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {error ? (
        <span className="max-w-[10rem] text-right text-[10px] leading-tight text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}
