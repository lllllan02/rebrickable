"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setBuildOwnedAction } from "@/app/build/build-owned-actions";
import { OWNED_SUBJECT_PART } from "@/lib/build-owned-subject";

type Props = {
  partNum: string;
  initialOwned: boolean;
  initialQuantity: number;
  className?: string;
  /** 拥有页方格等窄布局：更小按钮与输入框 */
  compact?: boolean;
};

export function PartOwnedStockControl({
  partNum,
  initialOwned,
  initialQuantity,
  className = "",
  compact = false,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [owned, setOwned] = useState(initialOwned);
  const [qtyInput, setQtyInput] = useState(String(Math.max(1, initialQuantity)));

  useEffect(() => {
    setOwned(initialOwned);
    setQtyInput(String(Math.max(1, initialQuantity)));
  }, [initialOwned, initialQuantity, partNum]);

  const baseBtn = compact
    ? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold leading-none transition-colors disabled:opacity-50"
    : "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg font-semibold leading-none transition-colors disabled:opacity-50";

  const persistQuantity = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      setQtyInput(String(Math.max(1, initialQuantity)));
      return;
    }
    startTransition(async () => {
      const res = await setBuildOwnedAction({
        subjectKind: OWNED_SUBJECT_PART,
        subjectId: partNum,
        owned: true,
        quantity: n,
      });
      if (!res.ok) {
        setQtyInput(String(Math.max(1, initialQuantity)));
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-1 justify-center" : "gap-2"} ${className}`.trim()}>
      <button
        type="button"
        title={owned ? "点击取消「拥有」" : "点击标记为拥有（默认数量 1）"}
        aria-label={owned ? "取消拥有" : "标记为拥有"}
        aria-pressed={owned}
        disabled={pending}
        className={`${baseBtn} ${
          owned
            ? "border-[var(--accent)] bg-[var(--accent)] text-[#141414] shadow-sm hover:opacity-90"
            : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
        }`.trim()}
        onClick={(e) => {
          e.preventDefault();
          const next = !owned;
          setOwned(next);
          startTransition(async () => {
            const res = await setBuildOwnedAction({
              subjectKind: OWNED_SUBJECT_PART,
              subjectId: partNum,
              owned: next,
              quantity: next ? Math.max(1, Number.parseInt(qtyInput, 10) || 1) : undefined,
            });
            if (!res.ok) {
              setOwned(!next);
              return;
            }
            if (next) setQtyInput(String(Math.max(1, Number.parseInt(qtyInput, 10) || 1)));
            router.refresh();
          });
        }}
      >
        {owned ? "✓" : "+"}
      </button>
      {owned ? (
        <label
          className={`flex items-center text-[var(--text)] ${compact ? "gap-1 text-[10px]" : "gap-1.5 text-sm"}`}
        >
          <span className={compact ? "text-[var(--muted-2)]" : "text-[var(--muted)]"}>数量</span>
          <input
            type="number"
            min={1}
            inputMode="numeric"
            disabled={pending}
            className={
              compact
                ? "field w-12 py-1 text-center text-xs tabular-nums"
                : "field w-[5.5rem] py-1.5 text-center text-sm tabular-nums"
            }
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={() => persistQuantity(qtyInput)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
