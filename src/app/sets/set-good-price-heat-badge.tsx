import type { SetGoodPriceHeatBreakdown } from "@/lib/set-good-price-heat";
import { formatSetGoodPriceHeatTooltip } from "@/lib/set-good-price-heat";
import { SetGoodPriceHeatDots } from "@/app/sets/set-good-price-heat-dots";

/** 三颗圆点表示热度等级：从左连续点亮 level 颗，与具体低于哪项无关 */
export function SetGoodPriceHeatBadge({ breakdown }: { breakdown: SetGoodPriceHeatBreakdown }) {
  const { level } = breakdown;
  if (level === 0) return null;

  const tooltip = formatSetGoodPriceHeatTooltip(breakdown);

  return (
    <span
      className="inline-flex shrink-0 items-center pt-0.5"
      title={tooltip}
      aria-label={tooltip}
    >
      <SetGoodPriceHeatDots level={level} />
    </span>
  );
}
