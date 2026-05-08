import Link from "next/link";

const links = [
  { href: "/", label: "首页" },
  { href: "/parts", label: "零件" },
  { href: "/sets", label: "套装" },
  { href: "/colors", label: "颜色" },
] as const;

export function SiteNav() {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-lg font-semibold tracking-tight text-[var(--text)] no-underline hover:text-[var(--accent)]"
        >
          Rebrickable 本地库
        </Link>
        <nav className="flex flex-wrap gap-3 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-2 py-1 text-[var(--muted)] no-underline hover:bg-[var(--border)] hover:text-[var(--text)]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
