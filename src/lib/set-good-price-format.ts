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

/** 占地单位单价（元/单位，宽×深×高 stud 积） */
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
