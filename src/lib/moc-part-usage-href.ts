import type { ListMarkFilter } from "@/lib/build-list-mark-filter";
import { MOC_PROFILE_MAX_TAG_LEN } from "@/lib/moc-profile-parse";
import { likeFragment } from "@/lib/search";

/** 与 `/mocs` 同源筛选参数，指向零件使用率页 */
export function mocPartUsageHref(params: {
  q?: string;
  tag?: string;
  mark?: ListMarkFilter;
  premium?: boolean;
}): string {
  const sp = new URLSearchParams();
  const q = likeFragment(params.q ?? "");
  if (q.length > 0) sp.set("q", q);
  const tag = (params.tag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN);
  if (tag.length > 0) sp.set("tag", tag);
  if (params.mark && params.mark !== "all") sp.set("mark", params.mark);
  if (params.premium === true) sp.set("premium", "1");
  const qs = sp.toString();
  return qs ? `/mocs/part-usage?${qs}` : "/mocs/part-usage";
}
