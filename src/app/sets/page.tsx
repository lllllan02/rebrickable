import Link from "next/link";
import { asc, countDistinct, like } from "drizzle-orm";

import { getDb } from "@/db/client";
import { inventories } from "@/db/schema";
import { likeFragment } from "@/lib/search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export default async function SetsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qRaw = sp.q ?? "";
  const q = likeFragment(qRaw);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const db = getDb();
  const where =
    q.length > 0 ? like(inventories.setNum, `%${q}%`) : undefined;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ c: countDistinct(inventories.setNum) })
      .from(inventories)
      .where(where),
    db
      .selectDistinct({ setNum: inventories.setNum })
      .from(inventories)
      .where(where)
      .orderBy(asc(inventories.setNum))
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
        <h1 className="text-2xl font-semibold">套装</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          按 <code className="text-[var(--accent)]">set_num</code>{" "}
          浏览；清单使用各套装最高{" "}
          <code className="text-[var(--accent)]">version</code> 的库存。
        </p>
      </div>
      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={qRaw}
          placeholder="例如 42143、42143-1…"
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
          <li key={r.setNum} className="px-3 py-2">
            <Link
              href={`/sets/${encodeURIComponent(r.setNum)}`}
              className="font-mono text-[var(--accent)] no-underline"
            >
              {r.setNum}
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-[var(--muted)]">
            没有匹配的套装。
          </li>
        ) : null}
      </ul>
      <div className="text-sm text-[var(--muted)]">
        共 {Number(total).toLocaleString("zh-CN")} 套（去重）
      </div>
      {totalPages > 1 ? (
        <div className="flex justify-end">
          <nav
            aria-label="分页"
            className="flex flex-wrap items-center justify-end gap-2 text-sm"
          >
            {page > 1 ? (
              <Link href={`/sets${qs(page - 1)}`} className="no-underline">
                ← 上一页
              </Link>
            ) : null}
            <span className="text-[var(--muted)]">
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link href={`/sets${qs(page + 1)}`} className="no-underline">
                下一页 →
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}
    </div>
  );
}
