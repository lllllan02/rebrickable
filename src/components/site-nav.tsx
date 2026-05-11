import Link from "next/link";

import { GlobalSearch } from "@/components/global-search";

const links = [
  { href: "/", label: "首页" },
  { href: "/parts", label: "零件" },
  { href: "/sets", label: "套装" },
  { href: "/colors", label: "颜色" },
  { href: "/shortage", label: "缺件表" },
] as const;

export function SiteNav() {
  return (
    <header className="site-header">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand">
          Rebrickable 本地库
        </Link>
        <GlobalSearch />
        <nav className="site-links site-links-end">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="site-link">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
