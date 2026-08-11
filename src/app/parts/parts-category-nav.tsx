import Link from "next/link";

export type PartsCategoryNavRow = {
  id: number;
  name: string;
  count: number;
};

function catHref(
  filter: "all" | number,
  q: string,
  piece: "plain" | "printed" | null
): string {
  const u = new URLSearchParams();
  if (filter !== "all") u.set("cat", String(filter));
  if (q.trim()) u.set("q", q.trim());
  if (piece) u.set("piece", piece);
  const s = u.toString();
  return s ? `/parts?${s}` : "/parts";
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

export function PartsCategoryNav({
  total,
  categories,
  active,
  q,
  piece,
}: {
  total: number;
  categories: PartsCategoryNavRow[];
  active: "all" | number;
  q: string;
  piece: "plain" | "printed" | null;
}) {
  return (
    <nav
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label="按分类筛选零件"
    >
      <h2 className="text-xs font-semibold text-[var(--text)]">分类</h2>
      <div className="mt-2 max-h-[min(28rem,55vh)] space-y-0.5 overflow-y-auto pr-0.5">
        <NavRow
          href={catHref("all", q, piece)}
          label="全部"
          count={total}
          active={active === "all"}
        />
        {categories.map((c) => (
          <NavRow
            key={c.id}
            href={catHref(c.id, q, piece)}
            label={c.name}
            count={c.count}
            active={active === c.id}
          />
        ))}
      </div>
    </nav>
  );
}
