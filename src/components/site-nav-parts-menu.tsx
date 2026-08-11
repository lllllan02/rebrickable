"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function isFavoritesPath(path: string): boolean {
  return path === "/parts/favorites" || path.startsWith("/parts/favorites/");
}

function isPurchasePath(path: string): boolean {
  return path === "/parts/purchase" || path.startsWith("/parts/purchase/");
}

function isOwnedPath(path: string): boolean {
  return path === "/parts/owned" || path.startsWith("/parts/owned/");
}

function isCatalogPath(path: string): boolean {
  return (
    path === "/parts" ||
    (path.startsWith("/parts/") &&
      !isFavoritesPath(path) &&
      !isPurchasePath(path) &&
      !isOwnedPath(path))
  );
}

const PARTS_ITEMS = [
  { href: "/parts", label: "零件目录", match: isCatalogPath },
  { href: "/parts/favorites", label: "收藏", match: isFavoritesPath },
  { href: "/parts/purchase", label: "购买清单", match: isPurchasePath },
  { href: "/parts/owned", label: "零件库", match: isOwnedPath },
] as const;

function isPartsSection(path: string): boolean {
  return path === "/parts" || path.startsWith("/parts/");
}

export function SiteNavPartsMenu() {
  const pathname = usePathname() ?? "";
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const sectionActive = isPartsSection(pathname);

  const closeMenu = () => {
    const el = detailsRef.current;
    if (el) el.open = false;
  };

  useEffect(() => {
    closeMenu();
  }, [pathname]);

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
    <details ref={detailsRef} className="group relative">
      <summary
        className={`site-link inline-flex list-none items-center gap-1 [&::-webkit-details-marker]:hidden ${
          sectionActive ? "border-[var(--border)] bg-[rgba(255,255,255,0.045)] text-[var(--text)]" : ""
        }`}
        aria-label="零件相关页面"
      >
        <span>Parts</span>
        <span
          className="text-[10px] text-[var(--muted-2)] transition-transform group-open:rotate-180"
          aria-hidden
        >
          ▼
        </span>
      </summary>
      <div
        role="menu"
        aria-label="零件"
        className="absolute left-0 z-40 mt-1 min-w-[8.5rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
      >
        {PARTS_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              aria-current={active ? "page" : undefined}
              onClick={closeMenu}
              className={`block px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
                  : "text-[var(--text)] hover:bg-[var(--surface-2)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </details>
  );
}
