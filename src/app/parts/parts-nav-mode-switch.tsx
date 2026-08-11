import Link from "next/link";

import type { PartsNavMode } from "@/lib/part-groups-shared";

export function PartsNavModeSwitch({
  mode,
  hrefCat,
  hrefGroup,
}: {
  mode: PartsNavMode;
  hrefCat: string;
  hrefGroup: string;
}) {
  return (
    <div
      className="inline-flex w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-xs"
      role="group"
      aria-label="侧栏筛选模式"
    >
      <Link
        href={hrefCat}
        aria-current={mode === "cat" ? "page" : undefined}
        className={`min-w-0 flex-1 rounded px-2 py-1.5 text-center transition-colors ${
          mode === "cat"
            ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
            : "text-[var(--muted)] hover:text-[var(--text)]"
        }`}
      >
        分类
      </Link>
      <Link
        href={hrefGroup}
        aria-current={mode === "group" ? "page" : undefined}
        className={`min-w-0 flex-1 rounded px-2 py-1.5 text-center transition-colors ${
          mode === "group"
            ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
            : "text-[var(--muted)] hover:text-[var(--text)]"
        }`}
      >
        自定义分组
      </Link>
    </div>
  );
}
