import type { SetListMarkFilter } from "@/lib/build-list-mark-filter";

/** 与 `/sets` 官方目录筛选链接一致 */
export function setListHref(params?: { mark?: SetListMarkFilter; theme?: string }): string {
  const sp = new URLSearchParams();
  const theme = (params?.theme ?? "").trim();
  if (theme.length > 0) sp.set("theme", theme);
  if (params?.mark && params.mark !== "all") sp.set("mark", params.mark);
  const qs = sp.toString();
  return qs ? `/sets?${qs}` : "/sets";
}
