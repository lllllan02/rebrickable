import {
  ownedCategoryQueryValue,
  type OwnedCategoryFilter,
} from "@/lib/owned-parts-category";
import {
  OWNED_DEFAULT_SORT,
  ownedSortStateToQuery,
  type OwnedSortState,
} from "@/lib/owned-parts-sort";
import type { OwnedViewMode } from "@/lib/load-owned-parts";

export function ownedPartsHref(opts: {
  view?: OwnedViewMode;
  cat?: OwnedCategoryFilter;
  sort?: OwnedSortState;
  page?: number;
}): string {
  const u = new URLSearchParams();
  const view = opts.view ?? "part";
  const cat = opts.cat ?? "all";
  const sort = opts.sort ?? OWNED_DEFAULT_SORT;
  const page = opts.page ?? 1;

  if (cat !== "all") {
    u.set("cat", ownedCategoryQueryValue(cat));
  }
  if (view === "element") {
    u.set("view", "element");
  }
  const sortQ = ownedSortStateToQuery(sort);
  if (sortQ.sort) u.set("sort", sortQ.sort);
  if (sortQ.dir) u.set("dir", sortQ.dir);
  if (page > 1) u.set("page", String(page));

  const s = u.toString();
  return s ? `/parts/owned?${s}` : "/parts/owned";
}
