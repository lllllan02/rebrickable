/** 全新价格可选渠道（与全新价绑定） */
export const SET_GOOD_PRICE_CHANNELS_NEW = ["拼多多", "淘宝"] as const;
export type SetGoodPriceChannelNew = (typeof SET_GOOD_PRICE_CHANNELS_NEW)[number];

export function parseSetGoodPriceChannelNew(raw: unknown): SetGoodPriceChannelNew | null {
  const s = String(raw ?? "").trim();
  if (SET_GOOD_PRICE_CHANNELS_NEW.includes(s as SetGoodPriceChannelNew)) {
    return s as SetGoodPriceChannelNew;
  }
  return null;
}

export function hasAnySetGoodPrice(priceNewCny: number | null | undefined): boolean {
  return typeof priceNewCny === "number" && Number.isFinite(priceNewCny) && priceNewCny >= 0;
}
