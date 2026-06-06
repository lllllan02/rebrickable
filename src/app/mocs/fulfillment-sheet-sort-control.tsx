"use client";

import { useEffect, useRef } from "react";

import {
  type FulfillmentSheetSortKey,
  type FulfillmentSheetSortState,
  fulfillmentSheetSortSummaryKindLabel,
  fulfillmentSheetSortTriggerAriaLabel,
  nextFulfillmentSheetSortOnPickerClick,
} from "@/lib/fulfillment-sheet-list-sort";

function SortGlyph({ className, arrowDown }: { className?: string; arrowDown: boolean }) {
  const arrowPath = arrowDown
    ? "M12 4v7M9 10.5l3 2.5 3-2.5"
    : "M12 12V5M9 5.5L12 3l3 2.5";
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M2.5 4.5h6M2.5 7.5h4.5M2.5 10.5h3"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d={arrowPath}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PICKER_ROWS: readonly { key: FulfillmentSheetSortKey; label: string; title: string }[] = [
  { key: "qty", label: "零件数", title: "重复点击：降序 → 升序 → 恢复默认" },
  { key: "unit_price", label: "单价", title: "重复点击：降序 → 升序 → 恢复默认" },
  { key: "line_total", label: "总价", title: "重复点击：降序 → 升序 → 恢复默认" },
];

type Props = {
  sortState: FulfillmentSheetSortState;
  onSortStateChange: (next: FulfillmentSheetSortState) => void;
};

export function FulfillmentSheetSortControl({ sortState, onSortStateChange }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const kindLabel = fulfillmentSheetSortSummaryKindLabel(sortState);
  const ariaLabel = fulfillmentSheetSortTriggerAriaLabel(sortState);
  const glyphArrowDown = sortState.neutral || sortState.dir === "desc";

  const closeMenu = () => {
    const el = detailsRef.current;
    if (el) el.open = false;
  };

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      const root = detailsRef.current;
      if (!root?.open) return;
      const t = e.target;
      if (t instanceof Node && !root.contains(t)) closeMenu();
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  return (
    <details ref={detailsRef} className="group relative w-[10.5rem] shrink-0">
      <summary
        className="flex w-full cursor-pointer list-none items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)] shadow-sm outline-none ring-[var(--accent)]/20 transition-colors hover:border-[var(--border)] hover:bg-[var(--surface)] focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
        aria-label={ariaLabel}
      >
        <SortGlyph className="shrink-0 text-[var(--muted)]" arrowDown={glyphArrowDown} />
        <span className="min-w-0 flex-1 whitespace-nowrap text-left text-[var(--text)]" aria-hidden>
          {kindLabel}
          {sortState.neutral ? (
            <span className="text-[var(--muted-2)]"> · 有修改优先</span>
          ) : null}
        </span>
        <span
          className="ml-0.5 shrink-0 text-[10px] text-[var(--muted-2)] transition-transform group-open:rotate-180"
          aria-hidden
        >
          ▼
        </span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-[10.5rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
        {PICKER_ROWS.map((row) => {
          const activeExplicit = !sortState.neutral && sortState.key === row.key;
          const activeDefault = sortState.neutral && row.key === "qty";
          const active = activeExplicit || activeDefault;
          return (
            <button
              key={row.key}
              type="button"
              title={row.title}
              aria-current={active ? "true" : undefined}
              onClick={() => {
                onSortStateChange(nextFulfillmentSheetSortOnPickerClick(row.key, sortState));
                closeMenu();
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
                  : "text-[var(--text)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {row.label}
            </button>
          );
        })}
      </div>
    </details>
  );
}
