"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setOwnedPartColorQuantityAction } from "@/app/parts/owned-part-quantity-actions";

type Props = {
  partNum: string;
  colorId: number;
  initialQuantity: number;
  /** 数量成功变更后回调（零件库列表用于重算合计） */
  onQuantityChange?: (quantity: number) => void;
  /** 方格角标用更小输入框 */
  compact?: boolean;
  className?: string;
};

function displayValue(qty: number): string {
  return qty > 0 ? String(qty) : "";
}

export function OwnedElementQtyInput({
  partNum,
  colorId,
  initialQuantity,
  onQuantityChange,
  compact = false,
  className = "",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(displayValue(initialQuantity));
  const [savedQty, setSavedQty] = useState(Math.max(0, Math.floor(initialQuantity)));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = Math.max(0, Math.floor(initialQuantity));
    setSavedQty(next);
    setValue(displayValue(next));
    setError(null);
  }, [initialQuantity, partNum, colorId]);

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

    if (nextQty === savedQty) {
      setValue(displayValue(savedQty));
      setError(null);
      return;
    }

    const prev = savedQty;
    setSavedQty(nextQty);
    setValue(displayValue(nextQty));
    setError(null);
    onQuantityChange?.(nextQty);

    startTransition(async () => {
      const res = await setOwnedPartColorQuantityAction({
        partNum,
        colorId,
        quantity: nextQty,
      });
      if (!res.ok) {
        setSavedQty(prev);
        setValue(displayValue(prev));
        setError(res.error);
        onQuantityChange?.(prev);
        return;
      }
      setSavedQty(res.quantity);
      setValue(displayValue(res.quantity));
      onQuantityChange?.(res.quantity);
      router.refresh();
    });
  }

  const inputClass = compact
    ? "h-4 w-7 rounded border border-[var(--border)] bg-[rgba(7,10,18,0.9)] px-0.5 text-center text-[9px] font-semibold tabular-nums leading-none text-[var(--text)] shadow-sm outline-none focus:border-[var(--accent)] disabled:opacity-50"
    : "field w-16 px-1.5 py-1 text-center text-xs tabular-nums disabled:opacity-50";

  return (
    <label
      className={`inline-flex shrink-0 flex-col items-end gap-0.5 ${className}`.trim()}
    >
      <span className="sr-only">购入数量</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={pending}
        value={value}
        placeholder="0"
        title="购入零件总数"
        aria-label="购入零件总数"
        className={inputClass}
        onChange={(e) => {
          const next = e.target.value.replace(/[^\d]/g, "");
          setValue(next);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {error ? (
        <span className="max-w-[8rem] text-right text-[10px] leading-tight text-red-600">
          {error}
        </span>
      ) : null}
    </label>
  );
}
