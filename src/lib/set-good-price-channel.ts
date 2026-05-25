/** 全新价格可选渠道（与全新价绑定） */
export const SET_GOOD_PRICE_CHANNELS_NEW = ["拼多多", "淘宝"] as const;
export type SetGoodPriceChannelNew = (typeof SET_GOOD_PRICE_CHANNELS_NEW)[number];

/** 二手价格固定渠道 */
export const SET_GOOD_PRICE_CHANNEL_USED = "闲鱼" as const;

export function parseSetGoodPriceChannelNew(raw: unknown): SetGoodPriceChannelNew | null {
  const s = String(raw ?? "").trim();
  if (SET_GOOD_PRICE_CHANNELS_NEW.includes(s as SetGoodPriceChannelNew)) {
    return s as SetGoodPriceChannelNew;
  }
  return null;
}

/** 排序与展示用：取全新/二手中已填的最低价 */
export function setGoodPriceEffectiveMin(
  priceNewCny: number | null | undefined,
  priceUsedCny: number | null | undefined
): number | null {
  const candidates: number[] = [];
  if (typeof priceNewCny === "number" && Number.isFinite(priceNewCny) && priceNewCny >= 0) {
    candidates.push(priceNewCny);
  }
  if (typeof priceUsedCny === "number" && Number.isFinite(priceUsedCny) && priceUsedCny >= 0) {
    candidates.push(priceUsedCny);
  }
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

export function hasAnySetGoodPrice(
  priceNewCny: number | null | undefined,
  priceUsedCny: number | null | undefined
): boolean {
  return setGoodPriceEffectiveMin(priceNewCny, priceUsedCny) != null;
}
