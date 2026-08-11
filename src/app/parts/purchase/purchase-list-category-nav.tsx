import Link from "next/link";

import { purchaseListHref } from "@/lib/purchase-list-href";
import type {
  PurchaseCategorySummaryRow,
  PurchaseViewMode,
} from "@/lib/load-purchase-list";
import type { OwnedCategoryFilter } from "@/lib/owned-parts-category";
import type { OwnedSortState } from "@/lib/owned-parts-sort";

function NavRow({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
        active
          ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
          : "text-[var(--text)] hover:bg-[var(--surface-3)]"
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <span className="shrink-0 tabular-nums text-[var(--muted)]">
        {count.toLocaleString("zh-CN")}
      </span>
    </Link>
  );
}

export function PurchaseListCategoryNav({
  total,
  categories,
  uncategorizedCount,
  active,
  view,
  sort,
}: {
  total: number;
  categories: PurchaseCategorySummaryRow[];
  uncategorizedCount: number;
  active: OwnedCategoryFilter;
  view: PurchaseViewMode;
  sort: OwnedSortState;
}) {
  return (
    <nav
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label="按分类筛选购买清单"
    >
      <h2 className="text-xs font-semibold text-[var(--text)]">分类</h2>
      <div className="mt-2 max-h-[min(28rem,55vh)] space-y-0.5 overflow-y-auto pr-0.5">
        <NavRow
          href={purchaseListHref({ view, cat: "all", sort, by: "cat" })}
          label="全部"
          count={total}
          active={active === "all"}
        />
        {uncategorizedCount > 0 ? (
          <NavRow
            href={purchaseListHref({
              view,
              cat: "uncategorized",
              sort,
              by: "cat",
            })}
            label="未分类"
            count={uncategorizedCount}
            active={active === "uncategorized"}
          />
        ) : null}
        {categories.map((c) => (
          <NavRow
            key={c.id}
            href={purchaseListHref({ view, cat: c.id, sort, by: "cat" })}
            label={c.name}
            count={c.count}
            active={active === c.id}
          />
        ))}
      </div>
    </nav>
  );
}
