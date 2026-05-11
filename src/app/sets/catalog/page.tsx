import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

/** 官方清单已合并至 `/sets`，保留此路径以便旧链接与书签。 */
export default async function SetsCatalogRedirectPage({ searchParams }: Props) {
  const sp = await searchParams;
  const u = new URLSearchParams();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = typeof sp.page === "string" ? sp.page.trim() : "";
  if (q) u.set("q", q);
  if (page) u.set("page", page);
  const qs = u.toString();
  redirect(qs ? `/sets?${qs}` : "/sets");
}
