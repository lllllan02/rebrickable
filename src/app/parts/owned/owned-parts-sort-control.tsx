"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { ownedPartsHref } from "@/lib/owned-parts-href";
import type { OwnedCategoryFilter } from "@/lib/owned-parts-category";
import type { OwnedViewMode } from "@/lib/load-owned-parts";
import {
  OWNED_SORT_KEYS,
  nextOwnedSortOnPickerClick,
  ownedSortLabel,
  ownedSortTriggerAriaLabel,
  type OwnedSortKey,
  type OwnedSortState,
} from "@/lib/owned-parts-sort";

function SortGlyph({
  className,
  arrowDown,
}: {
  className?: string;
  arrowDown: boolean;
}) {
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

export function OwnedPartsSortControl({
  view,
  cat,
  sortState,
  by = "cat",
  group = "all",
}: {
  view: OwnedViewMode;
  cat: OwnedCategoryFilter;
  sortState: OwnedSortState;
  by?: "cat" | "group";
  group?: "all" | "ungrouped" | number;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const kindLabel = ownedSortLabel(sortState.key, view);
  const ariaLabel = ownedSortTriggerAriaLabel(sortState, view);
  const glyphArrowDown = sortState.dir === "desc";

  const hrefForPickerKey = (pick: OwnedSortKey) =>
    ownedPartsHref({
      view,
      cat,
      sort: nextOwnedSortOnPickerClick(pick, sortState),
      by,
      group,
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
    <details ref={detailsRef} className="group relative w-[10.5rem] shrink-0">
      <summary
        className="flex w-full cursor-pointer list-none items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)] shadow-sm outline-none ring-[var(--accent)]/20 transition-colors hover:bg-[var(--surface)] focus-visible:ring-2 [&::-webkit-details-marker]:hidden"
        aria-label={ariaLabel}
      >
        <SortGlyph
          className="shrink-0 text-[var(--muted)]"
          arrowDown={glyphArrowDown}
        />
        <span
          className="min-w-0 flex-1 truncate text-left text-[var(--text)]"
          aria-hidden
        >
          {kindLabel}
        </span>
        <span
          className="ml-0.5 shrink-0 text-[10px] text-[var(--muted-2)] transition-transform group-open:rotate-180"
          aria-hidden
        >
          ▼
        </span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-[10.5rem] overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
        {OWNED_SORT_KEYS.map((key) => {
          const active = sortState.key === key;
          const label = ownedSortLabel(key, view);
          return (
            <Link
              key={key}
              href={hrefForPickerKey(key)}
              title="重复点击切换升序 / 降序"
              aria-current={active ? "true" : undefined}
              onClick={closeMenu}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
                  : "text-[var(--text)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {active ? (
                <SortGlyph
                  className="shrink-0 text-[var(--muted)]"
                  arrowDown={glyphArrowDown}
                />
              ) : (
                <span className="inline-block w-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1">{label}</span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}
