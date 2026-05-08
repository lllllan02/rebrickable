import Link from "next/link";
import { asc, count, eq, like, or } from "drizzle-orm";

import { getDb } from "@/db/client";
import { partCategories, parts } from "@/db/schema";
import { likeFragment } from "@/lib/search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function PartsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qRaw = sp.q ?? "";
  const q = likeFragment(qRaw);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDb();
  const where =
    q.length > 0
      ? or(like(parts.name, `%${q}%`), like(parts.partNum, `%${q}%`))
      : undefined;

  const [totalRow, rows] = await Promise.all([
    db.select({ c: count() }).from(parts).where(where),
    db
      .select({
        partNum: parts.partNum,
        name: parts.name,
        catId: parts.partCatId,
        material: parts.partMaterial,
        catName: partCategories.name,
      })
      .from(parts)
      .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
      .where(where)
      .orderBy(asc(parts.partNum))
      .limit(PAGE_SIZE)
      .offset(offset),
  ]);

  const total = totalRow[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (qRaw.trim()) u.set("q", qRaw.trim());
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">零件</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          共 {Number(total).toLocaleString("zh-CN")} 条，支持按名称或编号模糊搜索。
        </p>
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={qRaw}
          placeholder="搜索名称或 part_num…"
          className="min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-2"
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black hover:bg-[var(--accent-dim)]"
        >
          搜索
        </button>
      </form>
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        {rows.map((r) => (
          <li key={r.partNum} className="px-3 py-2">
            <Link
              href={`/parts/${encodeURIComponent(r.partNum)}`}
              className="font-mono text-[var(--accent)]"
            >
              {r.partNum}
            </Link>
            <span className="mx-2 text-[var(--muted)]">—</span>
            <span>{r.name}</span>
            {r.catName ? (
              <span className="ml-2 text-xs text-[var(--muted)]">
                [{r.catName}]
              </span>
            ) : null}
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-[var(--muted)]">
            没有匹配的零件。
          </li>
        ) : null}
      </ul>
      {totalPages > 1 ? (
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          {page > 1 ? (
            <Link href={`/parts${qs(page - 1)}`} className="no-underline">
              ← 上一页
            </Link>
          ) : null}
          <span className="text-[var(--muted)]">
            第 {page} / {totalPages} 页
          </span>
          {page < totalPages ? (
            <Link href={`/parts${qs(page + 1)}`} className="no-underline">
              下一页 →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
