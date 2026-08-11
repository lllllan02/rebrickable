"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { QtySpinInput } from "@/components/qty-spin-input";
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

  return (
    <div
      className={`inline-flex shrink-0 flex-col items-end gap-0.5 ${className}`.trim()}
    >
      <span className="sr-only">购入数量</span>
      <QtySpinInput
        value={value}
        disabled={pending}
        placeholder="0"
        title="购入零件总数"
        aria-label="购入零件总数"
        compact={compact}
        canDecrement={savedQty > 0}
        onChange={(digits) => {
          setValue(digits);
          if (error) setError(null);
        }}
        onCommit={commit}
        onStep={step}
      />
      {error ? (
        <span className="max-w-[8rem] text-right text-[10px] leading-tight text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}
