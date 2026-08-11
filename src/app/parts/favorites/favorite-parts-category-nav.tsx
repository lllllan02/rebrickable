import Link from "next/link";

import type { FavoriteCategorySummaryRow } from "@/lib/load-favorite-parts";
import {
  ownedCategoryQueryValue,
  type OwnedCategoryFilter,
} from "@/lib/owned-parts-category";

function catHref(filter: OwnedCategoryFilter): string {
  if (filter === "all") return "/parts/favorites?by=cat";
  return `/parts/favorites?by=cat&cat=${encodeURIComponent(ownedCategoryQueryValue(filter))}`;
}

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

export function FavoritePartsCategoryNav({
  total,
  categories,
  uncategorizedCount,
  active,
}: {
  total: number;
  categories: FavoriteCategorySummaryRow[];
  uncategorizedCount: number;
  active: OwnedCategoryFilter;
}) {
  return (
    <nav
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label="按分类筛选收藏"
    >
      <h2 className="text-xs font-semibold text-[var(--text)]">分类</h2>
      <div className="mt-2 max-h-[min(28rem,55vh)] space-y-0.5 overflow-y-auto pr-0.5">
        <NavRow
          href={catHref("all")}
          label="全部"
          count={total}
          active={active === "all"}
        />
        {uncategorizedCount > 0 ? (
          <NavRow
            href={catHref("uncategorized")}
            label="未分类"
            count={uncategorizedCount}
            active={active === "uncategorized"}
          />
        ) : null}
        {categories.map((c) => (
          <NavRow
            key={c.id}
            href={catHref(c.id)}
            label={c.name}
            count={c.count}
            active={active === c.id}
          />
        ))}
      </div>
    </nav>
  );
}
