import Link from "next/link";

import { GlobalSearch } from "@/components/global-search";

const trailingLinks = [
  { href: "/owned", label: "拥有" },
  { href: "/mocs", label: "MOCs" },
  { href: "/sets", label: "Sets" },
  { href: "/parts", label: "Parts" },
] as const;

export function SiteNav() {
  return (
    <header className="site-header">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand">
          Rebrickable 本地库
        </Link>
        <div className="site-nav-trailing">
          <nav className="site-links" aria-label="主要栏目">
            {trailingLinks.map((l) => (
              <Link key={l.href} href={l.href} className="site-link">
                {l.label}
              </Link>
            ))}
          </nav>
          <GlobalSearch />
        </div>
      </div>
    </header>
  );
}
