import {
  setGoodPriceSortStateToQueryEntries,
  type SetGoodPriceListSortState,
} from "@/lib/set-good-price-list-sort";

export function setGoodPriceListHref(params: { sort?: SetGoodPriceListSortState | null }): string {
  const sp = new URLSearchParams();
  if (params.sort != null) {
    const sortQ = setGoodPriceSortStateToQueryEntries(params.sort);
    if (sortQ.kind != null) sp.set("kind", sortQ.kind);
    if (sortQ.metric != null) sp.set("metric", sortQ.metric);
    if (sortQ.dir != null) sp.set("dir", sortQ.dir);
  }
  const qs = sp.toString();
  return qs ? `/sets/prices?${qs}` : "/sets/prices";
}
