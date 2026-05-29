"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import type { ListMarkFilter } from "@/lib/build-list-mark-filter";
import { mocListHref } from "@/lib/moc-list-href";
import {
  type MocListSortKey,
  type MocListSortState,
  mocListSortSummaryKindLabel,
  mocListSortTriggerAriaLabel,
  nextMocListSortOnPickerClick,
} from "@/lib/moc-list-sort";

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

const PICKER_ROWS: readonly { key: MocListSortKey; label: string; title: string }[] = [
  { key: "parts", label: "零件数", title: "重复点击：升序 → 降序 → 恢复默认" },
  { key: "price", label: "总价", title: "重复点击：升序 → 降序 → 恢复默认" },
  { key: "added", label: "加入时间", title: "重复点击：升序 → 降序 → 恢复默认" },
];

type Props = {
  qSafe: string;
  tagHidden: string;
  mark: ListMarkFilter;
  premium: boolean;
  sortState: MocListSortState;
};

export function MocListSortControl({ qSafe, tagHidden, mark, premium, sortState }: Props) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const markParam = mark !== "all" ? mark : undefined;
  const tagParam = tagHidden.length > 0 ? tagHidden : undefined;
  const kindLabel = mocListSortSummaryKindLabel(sortState);
  const ariaLabel = mocListSortTriggerAriaLabel(sortState);
  const glyphArrowDown = sortState.neutral || sortState.dir === "desc";

  const hrefForPickerKey = (pick: MocListSortKey) =>
    mocListHref({
      q: qSafe,
      tag: tagParam,
      mark: markParam,
      premium,
      mocSort: nextMocListSortOnPickerClick(pick, sortState),
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

  // 宽度按最长「加入时间 · 默认」+ 图标 + ▼；改文案时请重调 w-[11.75rem]
  return (
    <details ref={detailsRef} className="group relative w-[11.75rem] shrink-0">
      <summary
        className="flex w-full cursor-pointer list-none items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-2 text-sm text-[var(--text)] shadow-sm outline-none ring-[var(--accent)]/20 transition-colors hover:border-[var(--border)] hover:bg-[var(--surface)] focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
        aria-label={ariaLabel}
      >
        <SortGlyph className="shrink-0 text-[var(--muted)]" arrowDown={glyphArrowDown} />
        <span className="min-w-0 flex-1 whitespace-nowrap text-left text-[var(--text)]" aria-hidden>
          {kindLabel}
          {sortState.neutral ? (
            <span className="text-[var(--muted-2)]"> · 默认</span>
          ) : null}
        </span>
        <span className="ml-0.5 shrink-0 text-[10px] text-[var(--muted-2)] transition-transform group-open:rotate-180" aria-hidden>
          ▼
        </span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-[11.75rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
        {PICKER_ROWS.map((row) => {
          const activeExplicit = !sortState.neutral && sortState.key === row.key;
          const activeDefault = sortState.neutral && row.key === "added";
          const active = activeExplicit || activeDefault;
          return (
            <Link
              key={row.key}
              href={hrefForPickerKey(row.key)}
              title={row.title}
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
  );
}
