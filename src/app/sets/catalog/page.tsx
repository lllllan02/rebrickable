import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; page?: string; theme?: string; mark?: string }> };

/** 官方清单已合并至 `/sets`，保留此路径以便旧链接与书签。 */
export default async function SetsCatalogRedirectPage({ searchParams }: Props) {
  const sp = await searchParams;
  const u = new URLSearchParams();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = typeof sp.page === "string" ? sp.page.trim() : "";
  const theme = typeof sp.theme === "string" ? sp.theme.trim() : "";
  const mark = typeof sp.mark === "string" ? sp.mark.trim().toLowerCase() : "";
  if (q) u.set("q", q);
  if (page) u.set("page", page);
  if (theme) u.set("theme", theme);
  if (mark && mark !== "all") u.set("mark", mark);
  const qs = u.toString();
  redirect(qs ? `/sets?${qs}` : "/sets");
}
