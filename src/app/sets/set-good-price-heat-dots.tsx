import Link from "next/link";

import type { SetGoodPriceHeatFilter } from "@/lib/set-good-price-heat";

const LEVEL_TONES = [
  "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.65)]",
  "bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.65)]",
  "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]",
] as const;

const HEAT_LEVELS = [1, 2, 3] as const;

/** 三颗圆点表示热度等级：从左连续点亮 level 颗 */
export function SetGoodPriceHeatDots({
  level,
  dotClass = "h-2.5 w-2.5",
  gapClass = "gap-1.5",
}: {
  level: 0 | 1 | 2 | 3;
  dotClass?: string;
  gapClass?: string;
}) {
  return (
    <span className={`inline-flex items-center ${gapClass}`} aria-hidden>
      {LEVEL_TONES.map((tone, i) => (
        <span
          key={i}
          className={`rounded-full ${dotClass} ${i < level ? tone : "bg-[var(--border-soft)]"}`}
        />
      ))}
    </span>
  );
}

type HeatFilterDotsProps = {
  heatFilter: SetGoodPriceHeatFilter;
  hrefForHeatLevel: (level: (typeof HEAT_LEVELS)[number]) => string;
};

/** 三颗可点击圆点：点第 n 颗亮 n 颗并筛选热度 n，再点同一颗取消 */
export function SetGoodPriceHeatFilterDots({ heatFilter, hrefForHeatLevel }: HeatFilterDotsProps) {
  const activeLevel =
    heatFilter.kind === "exact" && heatFilter.level >= 1 && heatFilter.level <= 3
      ? heatFilter.level
      : null;

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 shadow-sm">
      {HEAT_LEVELS.map((level, i) => {
        const selected = activeLevel === level;
        const lit = activeLevel != null && i < activeLevel;
        return (
          <Link
            key={level}
            href={hrefForHeatLevel(level)}
            title={selected ? "取消筛选" : `仅展示热度 ${level}`}
            aria-label={selected ? "取消筛选" : `仅展示热度 ${level}`}
            aria-current={selected ? "true" : undefined}
            className="inline-flex rounded-full p-0.5 transition-opacity hover:opacity-80"
          >
            <span
              className={`block h-2.5 w-2.5 rounded-full ${lit ? LEVEL_TONES[i] : "bg-[var(--border-soft)]"}`}
            />
          </Link>
        );
      })}
    </div>
  );
}
