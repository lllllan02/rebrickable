"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { goodPriceBtnSecondary } from "@/lib/set-good-price-buttons";
import {
  buildBricktimePriceChartModel,
  type BricktimePriceHistoryPoint,
} from "@/lib/bricktime-price-history";
import { formatBricktimePriceValue } from "@/lib/set-good-price-format";

export type SetGoodPricePriceHistoryDialogTarget = {
  setNum: string;
  title: string;
  officialPrice: string | null;
  priceHistory: BricktimePriceHistoryPoint[];
};

type Props = {
  target: SetGoodPricePriceHistoryDialogTarget | null;
  onClose: () => void;
};

function formatMonthLabel(month: string): string {
  const m = month.trim();
  const match = /^(\d{4})-(\d{1,2})$/.exec(m);
  if (!match) return m;
  return `${match[1]}-${match[2]!.padStart(2, "0")}`;
}

function formatPointPrice(price: number): string {
  return `¥${price.toLocaleString("zh-CN")}`;
}

const EXTREME_LABEL_EST_WIDTH = 72;
const MONTH_LABEL_EST_WIDTH = 44;

type ChartTextAnchor = "start" | "middle" | "end";

function resolveEdgeLabelX(
  pointX: number,
  index: number,
  total: number,
  bounds: { left: number; right: number },
  estimatedWidth: number
): { x: number; textAnchor: ChartTextAnchor } {
  if (total <= 1) {
    return {
      x: Math.min(
        Math.max(pointX, bounds.left + estimatedWidth / 2),
        bounds.right - estimatedWidth / 2
      ),
      textAnchor: "middle",
    };
  }

  if (index === 0) {
    return {
      x: Math.min(Math.max(pointX, bounds.left), bounds.right - estimatedWidth),
      textAnchor: "start",
    };
  }

  if (index === total - 1) {
    return {
      x: Math.max(Math.min(pointX, bounds.right), bounds.left + estimatedWidth),
      textAnchor: "end",
    };
  }

  return {
    x: Math.min(
      Math.max(pointX, bounds.left + estimatedWidth / 2),
      bounds.right - estimatedWidth / 2
    ),
    textAnchor: "middle",
  };
}

function PriceHistoryChart({
  history,
  officialPrice,
}: {
  history: readonly BricktimePriceHistoryPoint[];
  officialPrice: string | null;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const chart = useMemo(
    () => buildBricktimePriceChartModel(history, officialPrice),
    [history, officialPrice]
  );

  const { minPrice, maxPrice } = useMemo(() => {
    if (history.length === 0) return { minPrice: null, maxPrice: null };
    let min = history[0]!.price;
    let max = history[0]!.price;
    for (const row of history) {
      min = Math.min(min, row.price);
      max = Math.max(max, row.price);
    }
    return { minPrice: min, maxPrice: max };
  }, [history]);

  if (!chart) return null;

  const { width, height, pad, points, pathD, officialY, officialPrice: officialNum, yTicks } =
    chart;
  const activePoint = activeIndex != null ? points[activeIndex] : null;
  const plotBounds = { left: pad.left, right: width - pad.right };

  const tooltipWidth = 72;
  const tooltipHeight = 24;
  const tooltipX =
    activePoint != null
      ? Math.min(
          Math.max(activePoint.x - tooltipWidth / 2, plotBounds.left),
          plotBounds.right - tooltipWidth
        )
      : 0;
  const tooltipY =
    activePoint != null ? Math.max(activePoint.y - tooltipHeight - 10, pad.top) : 0;

  return (
    <div className="overflow-x-auto py-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[280px] w-full text-[var(--muted)]"
        role="img"
        aria-label="Bricktime 电商价格历史折线图"
        onMouseLeave={() => setActiveIndex(null)}
      >
        <rect
          x={pad.left}
          y={pad.top}
          width={width - pad.left - pad.right}
          height={height - pad.top - pad.bottom}
          fill="var(--surface-2)"
          opacity={0.35}
          rx={4}
        />

        {yTicks.map((tick) => (
          <g key={tick.label}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={tick.y}
              y2={tick.y}
              stroke="currentColor"
              strokeOpacity={0.12}
            />
            <text
              x={pad.left - 6}
              y={tick.y + 3}
              textAnchor="end"
              className="fill-[var(--muted-2)] text-[10px]"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {officialY != null && officialNum != null ? (
          <>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={officialY}
              y2={officialY}
              stroke="rgb(251 191 36 / 0.55)"
              strokeDasharray="5 4"
            />
            <text
              x={width - pad.right}
              y={officialY - 4}
              textAnchor="end"
              className="fill-amber-200/90 text-[10px]"
            >
              官方 {formatBricktimePriceValue(String(officialNum))}
            </text>
          </>
        ) : null}

        <path
          d={pathD}
          fill="none"
          stroke="rgb(52 211 153 / 0.95)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          pointerEvents="none"
        />

        {activePoint ? (
          <line
            x1={activePoint.x}
            x2={activePoint.x}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="rgb(52 211 153 / 0.35)"
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        ) : null}

        {points.map((point, index) => {
          const active = activeIndex === index;
          const isMin = minPrice != null && point.price === minPrice;
          const isMax = maxPrice != null && point.price === maxPrice;
          const isExtreme = isMin || isMax;
          const dotRadius = active ? 5.5 : isExtreme ? 5 : 3.5;
          const dotFill = isMax
            ? "rgb(251 113 133 / 0.98)"
            : isMin
              ? "rgb(45 212 191 / 0.98)"
              : "rgb(16 185 129 / 0.95)";
          const ringStroke = isMax
            ? "rgb(251 113 133 / 0.75)"
            : "rgb(45 212 191 / 0.75)";
          const extremeLabel =
            isExtreme && activeIndex !== index
              ? resolveEdgeLabelX(
                  point.x,
                  index,
                  points.length,
                  plotBounds,
                  EXTREME_LABEL_EST_WIDTH
                )
              : null;

          return (
            <g
              key={`${point.month}-${point.price}`}
              onMouseEnter={() => setActiveIndex(index)}
              className="cursor-pointer"
            >
              <circle cx={point.x} cy={point.y} r={14} fill="transparent" />
              {isExtreme ? (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={9}
                  fill="none"
                  stroke={ringStroke}
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              ) : null}
              <circle
                cx={point.x}
                cy={point.y}
                r={dotRadius}
                fill={dotFill}
                stroke="var(--surface)"
                strokeWidth={active || isExtreme ? 2 : 1.5}
                pointerEvents="none"
              />
              {extremeLabel ? (
                <text
                  x={extremeLabel.x}
                  y={isMax ? point.y - 12 : point.y + 18}
                  textAnchor={extremeLabel.textAnchor}
                  className={`pointer-events-none text-[9px] font-medium tabular-nums ${
                    isMax ? "fill-rose-300/95" : "fill-teal-300/95"
                  }`}
                >
                  {isMax ? "最高" : "最低"} {formatPointPrice(point.price)}
                </text>
              ) : null}
            </g>
          );
        })}

        {activePoint ? (
          <g pointerEvents="none">
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx={5}
              fill="var(--surface)"
              stroke="rgb(52 211 153 / 0.45)"
            />
            <text
              x={tooltipX + tooltipWidth / 2}
              y={tooltipY + tooltipHeight / 2 + 4}
              textAnchor="middle"
              className="fill-emerald-200/95 text-[11px] font-semibold tabular-nums"
            >
              {formatPointPrice(activePoint.price)}
            </text>
          </g>
        ) : null}

        {points.map((point, index) => {
          const showLabel =
            points.length <= 8 || index === 0 || index === points.length - 1 || index % 2 === 0;
          if (!showLabel) return null;
          const monthLabel = resolveEdgeLabelX(
            point.x,
            index,
            points.length,
            plotBounds,
            MONTH_LABEL_EST_WIDTH
          );
          return (
            <text
              key={`${point.month}-label`}
              x={monthLabel.x}
              y={height - 8}
              textAnchor={monthLabel.textAnchor}
              className="fill-[var(--muted-2)] text-[9px] pointer-events-none"
            >
              {formatMonthLabel(point.month)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export function SetGoodPricePriceHistoryDialog({ target, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();

  useEffect(() => {
    if (!target) {
      dialogRef.current?.close();
      return;
    }
    dialogRef.current?.showModal();
  }, [target]);

  const closeDialog = () => {
    dialogRef.current?.close();
    onClose();
  };

  const officialLabel = target ? formatBricktimePriceValue(target.officialPrice) : null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-[200] m-0 hidden max-h-[min(92dvh,28rem)] min-h-0 w-[min(96vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden overscroll-contain rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/70 open:flex"
      aria-labelledby={dialogTitleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      {target ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
            <div className="min-w-0">
              <h3 id={dialogTitleId} className="text-base font-semibold">
                电商价格曲线
              </h3>
              <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text)]">{target.title}</p>
              <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                <span className="font-mono">{target.setNum}</span>
                {officialLabel ? (
                  <>
                    {" · "}
                    官方定价 {officialLabel}
                  </>
                ) : null}
                {" · "}
                共 {target.priceHistory.length} 个月
              </p>
            </div>
            <button
              type="button"
              className={goodPriceBtnSecondary}
              onClick={closeDialog}
              aria-label="关闭"
            >
              关闭
            </button>
          </div>

          <div className="px-4 py-4">
            <PriceHistoryChart
              history={target.priceHistory}
              officialPrice={target.officialPrice}
            />
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
