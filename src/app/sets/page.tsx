import Image from "next/image";
import Link from "next/link";
import {
  and,
  asc,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  like,
  max,
  min,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb } from "@/db/client";
import { inventories, inventoryParts, legoSets } from "@/db/schema";
import { likeFragment } from "@/lib/search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

/** 页码序列：首尾与当前附近若干页，间断处用 gap 占位以便渲染省略号 */
function pageNavSequence(
  current: number,
  total: number,
  neighbors = 3
): (number | "gap")[] {
  if (total <= 1) return [1];
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let p = current - neighbors; p <= current + neighbors; p++) {
    if (p >= 1 && p <= total) set.add(p);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("gap");
    out.push(p);
  }
  return out;
}

type Props = { searchParams: Promise<{ q?: string; page?: string }> };

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export default async function SetsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qRaw = sp.q ?? "";
  const q = likeFragment(qRaw);
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const db = getDb();

  const invWhere: SQL | undefined =
    q.length > 0 ? like(inventories.setNum, `%${q}%`) : undefined;

  const invLatest = db
    .select({
      setNum: inventories.setNum,
      maxVersion: max(inventories.version).as("max_version"),
    })
    .from(inventories)
    .groupBy(inventories.setNum)
    .as("inv_latest");

  const totalRow = await db
    .select({ c: countDistinct(inventories.setNum) })
    .from(inventories)
    .where(invWhere);

  const total = Number(totalRow[0]?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(totalPages, requestedPage);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      setNum: inventories.setNum,
      inventoryId: inventories.id,
      version: inventories.version,
      setBoxImg: legoSets.imgUrl,
    })
    .from(inventories)
    .innerJoin(
      invLatest,
      and(
        eq(inventories.setNum, invLatest.setNum),
        eq(inventories.version, invLatest.maxVersion)
      )
    )
    .leftJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
    .where(invWhere)
    .orderBy(asc(inventories.setNum))
    .limit(PAGE_SIZE)
    .offset(offset);

  const invIds = rows.map((r) => r.inventoryId);
  const invIdsNeedPartThumb = rows
    .filter((r) => !usableImgUrl(r.setBoxImg))
    .map((r) => r.inventoryId);
  const thumbByInv = new Map<number, string>();
  const uniquePartsByInv = new Map<number, number>();
  const mainQtyByInv = new Map<number, number>();
  const spareQtyByInv = new Map<number, number>();

  if (invIds.length > 0) {
    const [thumbRows, statRows] = await Promise.all([
      invIdsNeedPartThumb.length > 0
        ? db
            .select({
              inventoryId: inventoryParts.inventoryId,
              thumb: min(inventoryParts.imgUrl),
            })
            .from(inventoryParts)
            .where(
              and(
                inArray(inventoryParts.inventoryId, invIdsNeedPartThumb),
                isNotNull(inventoryParts.imgUrl),
                ne(inventoryParts.imgUrl, "")
              )
            )
            .groupBy(inventoryParts.inventoryId)
        : Promise.resolve([] as { inventoryId: number; thumb: string | null }[]),
      db
        .select({
          inventoryId: inventoryParts.inventoryId,
          uniqueParts: countDistinct(inventoryParts.partNum),
          mainQty: sql<number>`coalesce(sum(case when ${inventoryParts.isSpare} = 0 then ${inventoryParts.quantity} else 0 end), 0)`,
          spareQty: sql<number>`coalesce(sum(case when ${inventoryParts.isSpare} = 1 then ${inventoryParts.quantity} else 0 end), 0)`,
        })
        .from(inventoryParts)
        .where(inArray(inventoryParts.inventoryId, invIds))
        .groupBy(inventoryParts.inventoryId),
    ]);

    for (const t of thumbRows) {
      if (t.thumb) thumbByInv.set(t.inventoryId, t.thumb);
    }
    for (const s of statRows) {
      uniquePartsByInv.set(s.inventoryId, Number(s.uniqueParts));
      mainQtyByInv.set(s.inventoryId, Number(s.mainQty));
      spareQtyByInv.set(s.inventoryId, Number(s.spareQty));
    }
  }

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
          共 {total.toLocaleString("zh-CN")}{" "}
          套（按 set_num 去重）；每条展示该套装在库存表中的最高{" "}
          <code className="text-[var(--accent)]">version</code>{" "}
          对应清单的统计。封面优先使用{" "}
          <code className="text-[var(--accent)]">sets.csv</code>{" "}
          中的盒图；若未导入该文件或该套装无图，则用清单里某零件的示意图代替。
          关键词匹配{" "}
          <code className="text-[var(--accent)]">set_num</code>。
        </p>
      </div>
      <form method="get" className="flex flex-wrap items-stretch gap-2">
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
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((r) => {
          const thumb = usableImgUrl(r.setBoxImg)
            ? r.setBoxImg.trim()
            : thumbByInv.get(r.inventoryId);
          const uniqueParts = uniquePartsByInv.get(r.inventoryId) ?? 0;
          const mainQty = mainQtyByInv.get(r.inventoryId) ?? 0;
          const spareQty = spareQtyByInv.get(r.inventoryId) ?? 0;
          return (
            <li
              key={r.setNum}
              className="flex gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[var(--bg)]">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    width={56}
                    height={56}
                    className="box-border h-full w-full object-contain p-0.5"
                    sizes="56px"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]"
                    title="无盒图且无清单零件图（可放入 assets/sets.csv.gz 后重新导入）"
                  >
                    无图
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <Link
                    href={`/sets/${encodeURIComponent(r.setNum)}`}
                    className="font-mono text-xs font-semibold text-[var(--accent)] sm:text-[13px]"
                  >
                    {r.setNum}
                  </Link>
                  <span
                    className="rounded bg-[var(--bg)] px-1 py-px text-[10px] text-[var(--muted)] ring-1 ring-[var(--border)]"
                    title="当前使用的库存版本"
                  >
                    v{r.version}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted)]">
                  {uniqueParts > 0 ? (
                    <span>{uniqueParts.toLocaleString("zh-CN")} 种零件</span>
                  ) : null}
                  {mainQty > 0 ? (
                    <span>主件 {mainQty.toLocaleString("zh-CN")} 粒</span>
                  ) : null}
                  {spareQty > 0 ? (
                    <span>备用 {spareQty.toLocaleString("zh-CN")} 粒</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="col-span-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-8 text-center text-sm text-[var(--muted)]">
            没有匹配的套装。
          </li>
        ) : null}
      </ul>
      {totalPages > 1 ? (
        <div className="flex justify-end">
          <nav
            aria-label="分页"
            className="flex w-fit max-w-full flex-wrap items-center justify-end gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
          >
            {page > 1 ? (
              <Link
                href={`/sets${qs(page - 1)}`}
                className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)] no-underline hover:bg-[var(--bg)]"
              >
                上一页
              </Link>
            ) : (
              <span className="shrink-0 rounded border border-transparent px-2 py-1 text-xs text-[var(--muted)]">
                上一页
              </span>
            )}
            <div className="flex flex-wrap items-center gap-0.5">
              {(() => {
                const seq = pageNavSequence(page, totalPages, 4);
                const mid = Math.floor(seq.length / 2);
                const renderChunk = (
                  chunk: (number | "gap")[],
                  keyBase: number
                ) =>
                  chunk.map((item, i) => {
                    const k = keyBase + i;
                    return item === "gap" ? (
                      <span
                        key={`g-${k}`}
                        className="px-0.5 text-[var(--muted)]"
                        aria-hidden
                      >
                        …
                      </span>
                    ) : item === page ? (
                      <span
                        key={`p-${item}-${k}`}
                        className="inline-flex min-w-[1.75rem] justify-center rounded bg-[var(--accent)] px-1.5 py-1 text-xs font-semibold text-black"
                        aria-current="page"
                      >
                        {item}
                      </span>
                    ) : (
                      <Link
                        key={`p-${item}-${k}`}
                        href={`/sets${qs(item)}`}
                        className="inline-flex min-w-[1.75rem] justify-center rounded border border-[var(--border)] px-1.5 py-1 text-xs text-[var(--accent)] no-underline hover:bg-[var(--bg)]"
                      >
                        {item}
                      </Link>
                    );
                  });
                return (
                  <>
                    {renderChunk(seq.slice(0, mid), 0)}
                    <form
                      method="get"
                      action="/sets"
                      className="mx-0.5 inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded border border-[var(--border)] bg-[var(--bg)] outline-none ring-[var(--accent)] focus-within:ring-2"
                      title="输入页码后按回车跳转"
                    >
                      {qRaw.trim() ? (
                        <input type="hidden" name="q" value={qRaw.trim()} />
                      ) : null}
                      <input
                        type="number"
                        name="page"
                        min={1}
                        max={totalPages}
                        defaultValue={page}
                        required
                        aria-label={`跳转到页码，范围 1–${totalPages}，回车确认`}
                        className="h-full min-w-[1.75rem] max-w-[3.25rem] border-0 bg-transparent px-0.5 text-center font-mono text-xs text-[var(--text)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button type="submit" className="sr-only">
                        跳转
                      </button>
                    </form>
                    {renderChunk(seq.slice(mid), mid)}
                  </>
                );
              })()}
            </div>
            {page < totalPages ? (
              <Link
                href={`/sets${qs(page + 1)}`}
                className="shrink-0 rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--text)] no-underline hover:bg-[var(--bg)]"
              >
                下一页
              </Link>
            ) : (
              <span className="shrink-0 rounded border border-transparent px-2 py-1 text-xs text-[var(--muted)]">
                下一页
              </span>
            )}
            <span className="text-[11px] text-[var(--muted)]">
              第 {page}/{totalPages} 页
            </span>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
