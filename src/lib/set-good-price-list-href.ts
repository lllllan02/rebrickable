import {
  setGoodPriceSortStateToQueryEntries,
  type SetGoodPriceListSortState,
} from "@/lib/set-good-price-list-sort";
import {
  heatFilterToQueryValue,
  type SetGoodPriceHeatFilter,
} from "@/lib/set-good-price-heat";

export function setGoodPriceListHref(params: {
  sortState: SetGoodPriceListSortState;
  heatFilter?: SetGoodPriceHeatFilter;
}): string {
  const sp = new URLSearchParams();
  sp.set("kind", params.sortState.kind);
  const sortQ = setGoodPriceSortStateToQueryEntries(params.sortState);
  if (sortQ.metric != null) sp.set("metric", sortQ.metric);
  if (sortQ.dir != null) sp.set("dir", sortQ.dir);
  if (params.heatFilter != null) {
    const heat = heatFilterToQueryValue(params.heatFilter);
    if (heat != null) sp.set("heat", heat);
  }
  const qs = sp.toString();
  return qs ? `/sets/prices?${qs}` : "/sets/prices";
}
