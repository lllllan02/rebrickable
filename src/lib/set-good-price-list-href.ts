import {
  setGoodPriceSortStateToQueryEntries,
  type SetGoodPriceListSortState,
} from "@/lib/set-good-price-list-sort";
import {
  heatFilterToQueryValue,
  type SetGoodPriceHeatFilter,
} from "@/lib/set-good-price-heat";
import type { SetListMarkFilter } from "@/lib/build-list-mark-filter";

export function setGoodPriceListHref(params: {
  sortState: SetGoodPriceListSortState;
  heatFilter?: SetGoodPriceHeatFilter;
  markFilter?: SetListMarkFilter;
}): string {
  const sp = new URLSearchParams();
  const sortQ = setGoodPriceSortStateToQueryEntries(params.sortState);
  if (sortQ.metric != null) sp.set("metric", sortQ.metric);
  if (sortQ.dir != null) sp.set("dir", sortQ.dir);
  if (params.heatFilter != null) {
    const heat = heatFilterToQueryValue(params.heatFilter);
    if (heat != null) sp.set("heat", heat);
  }
  if (params.markFilter != null && params.markFilter !== "all") {
    sp.set("mark", params.markFilter);
  }
  const qs = sp.toString();
  return qs ? `/sets/prices?${qs}` : "/sets/prices";
}
