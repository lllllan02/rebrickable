import Link from "next/link";

/** 颜色命中：与套装/MOC 卡片同外框；媒体区为色块（搜索结果页等） */
export function ColorSwatchResultCard({
  href,
  rgb,
  title,
  subtitle,
}: {
  href: string;
  rgb: string;
  title: string;
  subtitle: string;
}) {
  return (
    <li className="result-card flex flex-col gap-0 overflow-hidden p-0">
      <Link href={href} className="group flex min-h-0 flex-1 flex-col text-inherit no-underline" aria-label={title}>
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]">
          <div
            className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
            style={{
              backgroundColor: `#${rgb}`,
              backgroundImage:
                "linear-gradient(145deg, rgba(255, 255, 255, 0.22), transparent 42%), linear-gradient(210deg, rgba(0, 0, 0, 0.35), transparent 48%)",
            }}
            aria-hidden
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
          <div className="min-w-0">
            <p className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 group-hover:underline">
              {title}
            </p>
            <p className="mt-1 truncate font-mono text-[0.72rem] text-[var(--muted)]" title={subtitle}>
              {subtitle}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
