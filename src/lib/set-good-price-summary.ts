import {
  SET_GOOD_PRICE_CHANNEL_USED,
  setGoodPriceEffectiveMin,
  type SetGoodPriceChannelNew,
} from "@/lib/set-good-price-channel";
import { formatSetGoodPriceCny, formatSetGoodPricePerPiece } from "@/lib/set-good-price-format";

export type SetGoodPriceSummaryInput = {
  priceNewCny: number | null;
  priceUsedCny: number | null;
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

/** 侧栏一行摘要：全新 ¥x（拼多多）· 二手 ¥y（闲鱼） */
export function setGoodPriceCompactSummary(input: SetGoodPriceSummaryInput): string | null {
  const parts: string[] = [];
  const newLine = formatSetGoodPriceLine("全新", input.priceNewCny, input.channelNew);
  const usedLine = formatSetGoodPriceLine(
    "二手",
    input.priceUsedCny,
    input.priceUsedCny != null ? SET_GOOD_PRICE_CHANNEL_USED : null
  );
  if (newLine) parts.push(newLine);
  if (usedLine) parts.push(usedLine);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** 列表卡片标题旁：取最低价展示 */
export function setGoodPriceListHeadline(input: SetGoodPriceSummaryInput): string | null {
  const min = setGoodPriceEffectiveMin(input.priceNewCny, input.priceUsedCny);
  return formatSetGoodPriceCny(min);
}

export function setGoodPriceListPerPieceHeadline(input: SetGoodPriceSummaryInput): string | null {
  const min = setGoodPriceEffectiveMin(input.priceNewCny, input.priceUsedCny);
  if (min == null) return null;
  return formatSetGoodPricePerPiece(min, input.numParts ?? null);
}
