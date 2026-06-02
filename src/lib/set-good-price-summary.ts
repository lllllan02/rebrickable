import type { SetGoodPriceChannelNew } from "@/lib/set-good-price-channel";
import { formatSetGoodPriceCny, formatSetGoodPricePerPiece } from "@/lib/set-good-price-format";

export type SetGoodPriceSummaryInput = {
  priceNewCny: number | null;
  channelNew: SetGoodPriceChannelNew | null;
  numParts?: number | null;
};

export function formatSetGoodPriceLine(
  label: string,
  priceCny: number | null | undefined,
  channel?: string | null
): string | null {
  const formatted = formatSetGoodPriceCny(priceCny);
  if (!formatted) return null;
  const ch = channel?.trim();
  return ch ? `${label} ${formatted}（${ch}）` : `${label} ${formatted}`;
}

/** 侧栏一行摘要：当前 ¥x（拼多多） */
export function setGoodPriceCompactSummary(input: SetGoodPriceSummaryInput): string | null {
  return formatSetGoodPriceLine("当前", input.priceNewCny, input.channelNew);
}

/** 列表卡片标题旁：展示当前价 */
export function setGoodPriceListHeadline(input: SetGoodPriceSummaryInput): string | null {
  return formatSetGoodPriceCny(input.priceNewCny);
}

export function setGoodPriceListPerPieceHeadline(input: SetGoodPriceSummaryInput): string | null {
  if (input.priceNewCny == null) return null;
  return formatSetGoodPricePerPiece(input.priceNewCny, input.numParts ?? null);
}
