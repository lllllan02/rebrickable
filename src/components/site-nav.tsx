import Link from "next/link";

const links = [
  { href: "/", label: "首页" },
  { href: "/parts", label: "零件" },
  { href: "/sets", label: "套装" },
  { href: "/colors", label: "颜色" },
] as const;

export function SiteNav() {
  return (
    <header className="site-header">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand">
          Rebrickable 本地库
        </Link>
        <nav className="site-links">
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
