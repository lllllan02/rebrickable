"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, Home, List, Settings } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/",
    label: "首页",
    icon: Home,
  },
  {
    href: "/sets",
    label: "套装列表",
    icon: List,
  },
  {
    href: "/parts",
    label: "零件目录",
    icon: Box,
  },
  {
    href: "/settings",
    label: "设置",
    icon: Settings,
  },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-base font-bold text-slate-950"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Box className="h-5 w-5" />
          </span>
          LEGO 管理
        </Link>

        <div className="flex flex-wrap gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950",
                  isActive && "bg-slate-950 text-white hover:bg-slate-800 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
