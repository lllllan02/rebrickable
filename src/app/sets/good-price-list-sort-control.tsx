"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { setGoodPriceListHref } from "@/lib/set-good-price-list-href";
import {
  type SetGoodPriceSortMetric,
  type SetGoodPriceListSortState,
  nextSetGoodPriceMetricClick,
  setGoodPriceMetricTriggerAriaLabel,
  setGoodPriceMetricTriggerLabel,
  setGoodPriceSortKindLabel,
} from "@/lib/set-good-price-list-sort";

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

const METRIC_ROWS: readonly { key: SetGoodPriceSortMetric; label: string }[] = [
  { key: "price", label: "总价" },
  { key: "discount", label: "折扣力度" },
];

const selectClass =
  "field min-w-[5.5rem] shrink-0 py-2 text-sm sm:min-w-[6rem]";

type Props = {
  sortState: SetGoodPriceListSortState;
};

export function GoodPriceListSortControl({ sortState }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const { kind, metric, dir } = sortState;
  const triggerLabel = setGoodPriceMetricTriggerLabel(sortState);
  const ariaLabel = setGoodPriceMetricTriggerAriaLabel(sortState);
  const glyphArrowDown = sortState.neutral || dir === "desc";

  const hrefForMetric = (pick: SetGoodPriceSortMetric) =>
    setGoodPriceListHref({
      sort: nextSetGoodPriceMetricClick(pick, sortState),
    });

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
    <div className="flex flex-wrap items-center gap-2">
      <form method="get" action="/sets/prices" className="flex items-center gap-1.5">
        <input type="hidden" name="metric" value={metric} />
        <input type="hidden" name="dir" value={dir} />
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="hidden sm:inline" aria-hidden>
            成色
          </span>
          <AutoSubmitSelect
            name="kind"
            value={kind}
            className={selectClass}
            aria-label={`排序成色：${setGoodPriceSortKindLabel(kind)}`}
          >
            <option value="new">全新</option>
            <option value="used">二手</option>
          </AutoSubmitSelect>
        </label>
      </form>

      <details ref={detailsRef} className="group relative w-[10.5rem] shrink-0">
        <summary
          className="flex w-full cursor-pointer list-none items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-sm text-[var(--text)] shadow-sm outline-none ring-[var(--accent)]/20 transition-colors hover:border-[var(--border)] hover:bg-[var(--surface)] focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
          aria-label={ariaLabel}
        >
          <SortGlyph className="shrink-0 text-[var(--muted)]" arrowDown={glyphArrowDown} />
          <span className="min-w-0 flex-1 whitespace-nowrap text-left" aria-hidden>
            {triggerLabel}
          </span>
          <span
            className="ml-0.5 shrink-0 text-[10px] text-[var(--muted-2)] transition-transform group-open:rotate-180"
            aria-hidden
          >
            ▼
          </span>
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-[10.5rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
          {METRIC_ROWS.map((row) => {
            const activeExplicit = !sortState.neutral && sortState.metric === row.key;
            const activeDefault = sortState.neutral && row.key === "price";
            const active = activeExplicit || activeDefault;
            return (
              <Link
                key={row.key}
                href={hrefForMetric(row.key)}
                title="重复点击同一项：升序 → 降序"
                aria-current={active ? "true" : undefined}
                onClick={closeMenu}
                className={`block px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
                    : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                }`}
              >
                {row.label}
              </Link>
            );
          })}
        </div>
      </details>
    </div>
  );
}
