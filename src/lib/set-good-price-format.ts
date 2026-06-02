/** 用户录入的好价（元）；无效时返回 null */
export function formatSetGoodPriceCny(priceCny: number | null | undefined): string | null {
  if (typeof priceCny !== "number" || !Number.isFinite(priceCny) || priceCny < 0) {
    return null;
  }
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(priceCny);
}

/** 单件价（元/片）；无有效件数时返回 null */
export function formatSetGoodPricePerPiece(
  priceCny: number,
  numParts: number | null | undefined
): string | null {
  if (!Number.isFinite(priceCny) || priceCny < 0) return null;
  const parts =
    typeof numParts === "number" && Number.isFinite(numParts) && numParts > 0 ? numParts : null;
  if (parts == null) return null;
  const per = priceCny / parts;
  if (!Number.isFinite(per) || per < 0) return null;
  return `${new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(per)}/片`;
}

/** 占地单位单价（元/单位，平面占地 stud²） */
export function formatSetGoodPricePerStudUnit(
  priceCny: number,
  totalStudUnits: number | null | undefined
): string | null {
  if (!Number.isFinite(priceCny) || priceCny < 0) return null;
  const units =
    typeof totalStudUnits === "number" &&
    Number.isFinite(totalStudUnits) &&
    totalStudUnits > 0
      ? totalStudUnits
      : null;
  if (units == null) return null;
  const per = priceCny / units;
  if (!Number.isFinite(per) || per < 0) return null;
  return `${new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(per)}/单位`;
}

/** 占地统计覆盖率（0–1） */
export function formatStudVolumeCoverageRatio(ratio: number | null | undefined): string | null {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    return null;
  }
  return `${(ratio * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

const BRICKTIME_PRICE_INPUT_RE = /^[\d.,]+(?:\s*[~～-]\s*[\d.,]+)?$/;

/** Bricktime 价格字符串（纯数字或区间）前加 ¥ */
export function formatBricktimePriceValue(value: string | null | undefined): string | null {
  const s = value?.trim();
  if (!s) return null;
  return BRICKTIME_PRICE_INPUT_RE.test(s) ? `¥${s}` : s;
}

/** 校验并规范官方原价输入；空为 null，无效为 undefined */
export function parseOptionalBricktimePriceInput(raw: unknown): string | null | undefined {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return BRICKTIME_PRICE_INPUT_RE.test(s) ? s : undefined;
}

function parseBricktimePriceAmount(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 解析 Bricktime 价格字符串为数值区间（单价时 min === max） */
export function parseBricktimePriceRange(
  value: string | null | undefined
): { min: number; max: number } | null {
  const s = value?.trim();
  if (!s) return null;
  const rangeMatch = s.match(/^([\d.,]+)\s*[~～-]\s*([\d.,]+)$/);
  if (rangeMatch) {
    const a = parseBricktimePriceAmount(rangeMatch[1]!);
    const b = parseBricktimePriceAmount(rangeMatch[2]!);
    if (a == null || b == null) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const single = parseBricktimePriceAmount(s);
  if (single == null) return null;
  return { min: single, max: single };
}

function formatDiscountFoldNumber(fold: number): string {
  const rounded = Math.round(fold * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** 相对官方原价计算折扣力度，如「9折」「4.7~4.9折」 */
export function formatDiscountVsOfficialPrice(
  comparePrice: string | number | null | undefined,
  officialPrice: string | null | undefined
): string | null {
  const official = parseBricktimePriceRange(officialPrice);
  if (!official || official.min <= 0) return null;

  let min: number;
  let max: number;
  if (typeof comparePrice === "number") {
    if (!Number.isFinite(comparePrice) || comparePrice < 0) return null;
    min = max = comparePrice;
  } else {
    const parsed = parseBricktimePriceRange(comparePrice);
    if (!parsed) return null;
    min = parsed.min;
    max = parsed.max;
  }

  const base = official.min;
  const minFold = (min / base) * 10;
  const maxFold = (max / base) * 10;
  if (!Number.isFinite(minFold) || !Number.isFinite(maxFold) || minFold <= 0) return null;

  const loFold = Math.min(minFold, maxFold);
  const hiFold = Math.max(minFold, maxFold);
  const loLabel = formatDiscountFoldNumber(loFold);
  const hiLabel = formatDiscountFoldNumber(hiFold);
  if (loLabel === hiLabel) return `${loLabel}折`;
  return `${loLabel}~${hiLabel}折`;
}

/** 相对官方原价的折扣折数（数值，用于排序；越小折扣越大） */
export function discountFoldVsOfficialPrice(
  comparePrice: number | null | undefined,
  officialPrice: string | null | undefined
): number | null {
  if (typeof comparePrice !== "number" || !Number.isFinite(comparePrice) || comparePrice < 0) {
    return null;
  }
  const official = parseBricktimePriceRange(officialPrice);
  if (!official || official.min <= 0) return null;
  const fold = (comparePrice / official.min) * 10;
  return Number.isFinite(fold) && fold > 0 ? fold : null;
}

/** 高砖零件匹配占比（0–100） */
export function formatGobricksMatchPercent(percent: number | null | undefined): string | null {
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    return null;
  }
  return `${percent.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}
