import type { ListMarkFilter } from "@/lib/build-list-mark-filter";
import { MOC_PROFILE_MAX_TAG_LEN } from "@/lib/moc-profile-parse";
import { mocSortStateToQueryEntries, type MocListSortState } from "@/lib/moc-list-sort";
import { likeFragment } from "@/lib/search";

/** 与 `/mocs` 列表筛选链接一致（标签 / 关键词 / mark / 排序） */
export function mocListHref(params: {
  q?: string;
  tag?: string;
  mark?: ListMarkFilter;
  /** 不传则 URL 不带排序参数 */
  mocSort?: MocListSortState | null;
}): string {
  const sp = new URLSearchParams();
  const q = likeFragment(params.q ?? "");
  if (q.length > 0) sp.set("q", q);
  const tag = (params.tag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN);
  if (tag.length > 0) sp.set("tag", tag);
  if (params.mark && params.mark !== "all") sp.set("mark", params.mark);
  if (params.mocSort != null) {
    const sortQ = mocSortStateToQueryEntries(params.mocSort);
    if (sortQ.sort != null) sp.set("sort", sortQ.sort);
    if (sortQ.dir != null) sp.set("dir", sortQ.dir);
  }
  const qs = sp.toString();
  return qs ? `/mocs?${qs}` : "/mocs";
}
