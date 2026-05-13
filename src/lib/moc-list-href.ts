import type { ListMarkFilter } from "@/lib/build-list-mark-filter";
import { MOC_PROFILE_MAX_TAG_LEN } from "@/lib/moc-profile-parse";
import { likeFragment } from "@/lib/search";

/** 与 `/mocs` 列表筛选链接一致（标签 / 关键词 / mark） */
export function mocListHref(params: { q?: string; tag?: string; mark?: ListMarkFilter }): string {
  const sp = new URLSearchParams();
  const q = likeFragment(params.q ?? "");
  if (q.length > 0) sp.set("q", q);
  const tag = (params.tag ?? "").trim().slice(0, MOC_PROFILE_MAX_TAG_LEN);
  if (tag.length > 0) sp.set("tag", tag);
  if (params.mark === "owned" || params.mark === "favorite") sp.set("mark", params.mark);
  const qs = sp.toString();
  return qs ? `/mocs?${qs}` : "/mocs";
}
