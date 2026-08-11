"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addPartToPurchaseListAction,
  removePartFromPurchaseListAction,
} from "@/app/parts/purchase/purchase-list-actions";

type Props = {
  partNum: string;
  initialInList: boolean;
  /** 列表角标用更小按钮 */
  compact?: boolean;
  className?: string;
};

export function PurchaseListAddToggle({
  partNum,
  initialInList,
  compact = false,
  className = "",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [inList, setInList] = useState(initialInList);

  useEffect(() => {
    setInList(initialInList);
  }, [initialInList, partNum]);

  const sizeClass = compact ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  const baseBtn = `inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-full border font-semibold leading-none transition-colors disabled:opacity-50`;

  return (
    <button
      type="button"
      title={inList ? "点击移出购买清单" : "点击加入购买清单"}
      aria-label={inList ? "移出购买清单" : "加入购买清单"}
      aria-pressed={inList}
      disabled={pending}
      className={`${baseBtn} ${
        inList
          ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-200 shadow-sm ring-1 ring-emerald-500/25 hover:bg-emerald-500/25"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--accent)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
      } ${className}`.trim()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !inList;
        setInList(next);
        startTransition(async () => {
          const res = next
            ? await addPartToPurchaseListAction({ partNum })
            : await removePartFromPurchaseListAction({ partNum });
          if (!res.ok) {
            setInList(!next);
            return;
          }
          router.refresh();
        });
      }}
    >
      购
    </button>
  );
}
