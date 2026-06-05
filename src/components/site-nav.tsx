import Link from "next/link";

import { BuildPartsSheetUpload } from "@/app/build/build-parts-sheet-upload";
import { SiteBrandLogo } from "@/components/site-brand-logo";
import { GlobalSearch } from "@/components/global-search";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

const trailingLinks = [
  { href: "/mocs", label: "MOCs" },
  { href: "/sets", label: "Sets" },
  { href: "/sets/prices", label: "好价" },
  { href: "/parts", label: "Parts" },
  { href: "/parts/owned", label: "散装" },
] as const;

export function SiteNav() {
  return (
    <header className="site-header">
      <div className="site-nav-inner">
        <Link href="/" className="site-brand" aria-label="ReBrickable 本地库">
          <SiteBrandLogo />
        </Link>
        <div className="site-nav-trailing">
          <nav className="site-links" aria-label="主要栏目">
            {trailingLinks.map((l) => (
              <Link key={l.href} href={l.href} className="site-link">
                {l.label}
              </Link>
            ))}
          </nav>
          <BuildPartsSheetUpload kind={BUILD_SUBJECT_MOC} variant="minimal" />
          <GlobalSearch />
        </div>
      </div>
    </header>
  );
}
