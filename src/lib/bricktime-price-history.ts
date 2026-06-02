import { parseBricktimePriceRange } from "@/lib/set-good-price-format";

export type BricktimePriceHistoryPoint = {
  price: number;
  updateTime: string;
};

type RawBricktimePriceHistoryRow = {
  price?: unknown;
  update_time?: unknown;
  updateTime?: unknown;
};

export function normalizeBricktimePriceHistoryRows(
  rows: readonly RawBricktimePriceHistoryRow[]
): BricktimePriceHistoryPoint[] {
  const out: BricktimePriceHistoryPoint[] = [];
  for (const row of rows) {
    const price = row.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) continue;
    const updateTimeRaw =
      typeof row.updateTime === "string"
        ? row.updateTime
        : typeof row.update_time === "string"
          ? row.update_time
          : "";
    const updateTime = updateTimeRaw.trim();
    if (!updateTime) continue;
    out.push({ price, updateTime });
  }
  return out;
}

export function serializeBricktimePriceHistory(
  points: readonly BricktimePriceHistoryPoint[]
): string | null {
  if (points.length === 0) return null;
  return JSON.stringify(points);
}

export function parseBricktimePriceHistoryJson(
  raw: string | null | undefined
): BricktimePriceHistoryPoint[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeBricktimePriceHistoryRows(parsed as RawBricktimePriceHistoryRow[]);
  } catch {
    return [];
  }
}

function currentMonthKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function historyPointMonthKey(updateTime: string): string | null {
  const match = /^(\d{4})-(\d{1,2})/.exec(updateTime.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]!.padStart(2, "0")}`;
}

export function hasBricktimePriceHistoryForCurrentMonth(
  history: readonly BricktimePriceHistoryPoint[],
  now = new Date()
): boolean {
  if (history.length === 0) return false;
  const month = currentMonthKey(now);
  return history.some((point) => historyPointMonthKey(point.updateTime) === month);
}

export type BricktimePriceChartPoint = {
  x: number;
  y: number;
  month: string;
  price: number;
};

export type BricktimePriceChartModel = {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
  points: BricktimePriceChartPoint[];
  pathD: string;
  officialPrice: number | null;
  officialY: number | null;
  yTicks: { y: number; label: string }[];
};

const CHART_PAD = { top: 14, right: 16, bottom: 30, left: 48 };

function formatAxisPrice(value: number): string {
  if (value >= 1000) return `¥${Math.round(value).toLocaleString("zh-CN")}`;
  return `¥${Math.round(value)}`;
}

export function buildBricktimePriceChartModel(
  history: readonly BricktimePriceHistoryPoint[],
  officialPriceRaw: string | null | undefined,
  size: { width?: number; height?: number } = {}
): BricktimePriceChartModel | null {
  if (history.length === 0) return null;

  const width = size.width ?? 560;
  const height = size.height ?? 210;
  const officialRange = parseBricktimePriceRange(officialPriceRaw);
  const officialPrice = officialRange?.min ?? null;

  const prices = history.map((row) => row.price);
  let minY = Math.min(...prices);
  let maxY = Math.max(...prices);
  if (officialPrice != null) {
    minY = Math.min(minY, officialPrice);
    maxY = Math.max(maxY, officialPrice);
  }

  const span = maxY - minY || 1;
  minY -= span * 0.08;
  maxY += span * 0.08;

  const plotW = width - CHART_PAD.left - CHART_PAD.right;
  const plotH = height - CHART_PAD.top - CHART_PAD.bottom;

  const toY = (price: number) =>
    CHART_PAD.top + plotH - ((price - minY) / (maxY - minY)) * plotH;

  const points: BricktimePriceChartPoint[] = history.map((row, index) => {
    const x =
      history.length === 1
        ? CHART_PAD.left + plotW / 2
        : CHART_PAD.left + (index / (history.length - 1)) * plotW;
    return { x, y: toY(row.price), month: row.updateTime, price: row.price };
  });

  const pathD = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  const yTicks = [
    { y: toY(maxY), label: formatAxisPrice(maxY) },
    { y: toY((maxY + minY) / 2), label: formatAxisPrice((maxY + minY) / 2) },
    { y: toY(minY), label: formatAxisPrice(minY) },
  ];

  return {
    width,
    height,
    pad: CHART_PAD,
    points,
    pathD,
    officialPrice,
    officialY: officialPrice != null ? toY(officialPrice) : null,
    yTicks,
  };
}
