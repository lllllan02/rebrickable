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
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb } from "@/db/client";
import { inventories, inventoryParts, legoSets, legoThemes } from "@/db/schema";
import { likeFragment } from "@/lib/search";

/** 与 MOC 列表相同栅格，略减小每页条数以控制首屏高度 */
const PAGE_SIZE = 24;

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

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export type SetsCatalogSearchParams = { q?: string; page?: string };

export async function SetsOfficialCatalogSection({
  searchParams,
  actionBase,
}: {
  searchParams: SetsCatalogSearchParams;
  actionBase: string;
}) {
  const qRaw = searchParams.q ?? "";
  const q = likeFragment(qRaw);
  const requestedPage = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const db = getDb();

  const pattern = `%${q}%`;
  const invWhere: SQL | undefined =
    q.length > 0
      ? or(like(inventories.setNum, pattern), like(legoSets.name, pattern))
      : undefined;

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
    .leftJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
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
      setName: legoSets.name,
      themeName: legoThemes.name,
    })
    .from(inventories)
    .innerJoin(
      invLatest,
      and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
    )
    .leftJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
    .leftJoin(legoThemes, eq(legoSets.themeId, legoThemes.id))
    .where(invWhere)
    .orderBy(asc(inventories.setNum))
    .limit(PAGE_SIZE)
    .offset(offset);

  const invIds = rows.map((r) => r.inventoryId);
  const invIdsNeedPartThumb = rows.filter((r) => !usableImgUrl(r.setBoxImg)).map((r) => r.inventoryId);
  const thumbByInv = new Map<number, string>();
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

  const detailPath = (setNum: string) => `/sets/${encodeURIComponent(setNum)}`;

  return (
    <section className="space-y-4" aria-labelledby="sets-official-catalog-heading">
      <div>
        <p className="page-kicker">Rebrickable 官方</p>
        <h2 id="sets-official-catalog-heading" className="page-title text-xl sm:text-2xl">
          套装目录
        </h2>
        <p className="page-description mt-2 text-sm">
          共 {total.toLocaleString("zh-CN")}{" "}
          套（按 <code className="code-pill">set_num</code> 去重）；每条为库存表中该套装最高{" "}
          <code className="code-pill">version</code> 的清单。盒图优先来自{" "}
          <code className="code-pill">sets.csv</code>
          ，否则用清单零件图；卡片左下角为主题（需导入{" "}
          <code className="code-pill">themes.csv.gz</code>）。关键词可匹配编号或套装名称。
        </p>
      </div>
      <form method="get" action={actionBase} className="filter-bar">
        <input
          name="q"
          defaultValue={qRaw}
          placeholder="set_num 或套装名关键词…"
          className="field min-w-[200px] flex-1 text-sm"
        />
        <button type="submit" className="button-primary text-sm">
          搜索
        </button>
      </form>
      <div className="table-shell">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const thumb = usableImgUrl(r.setBoxImg) ? r.setBoxImg.trim() : thumbByInv.get(r.inventoryId);
            const mainQty = mainQtyByInv.get(r.inventoryId) ?? 0;
            const spareQty = spareQtyByInv.get(r.inventoryId) ?? 0;
            const themeLabel = (r.themeName ?? "").trim();
            const title = (r.setName ?? "").trim() || `套装 ${r.setNum}`;
            const href = detailPath(r.setNum);
            return (
              <li key={r.setNum} className="result-card flex flex-col gap-0 overflow-hidden p-0">
                <Link
                  href={href}
                  className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]"
                  aria-label={`${title} 封面`}
                >
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt=""
                      fill
                      className="object-contain p-3"
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      unoptimized
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
                      无图
                    </span>
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
                  <div className="min-w-0">
                    <Link
                      href={href}
                      className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                    >
                      {title}
                    </Link>
                    <p
                      className="mt-1 truncate font-mono text-xs text-[var(--muted)]"
                      title={`${r.setNum} · 清单 v${r.version}`}
                    >
                      {r.setNum} · v{r.version}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--muted)]">
                    <span className="min-w-0 flex-1 text-left leading-snug text-[var(--text)]">
                      <span className="text-[var(--muted-2)]">主题 </span>
                      <span className="line-clamp-2 break-words" title={themeLabel || undefined}>
                        {themeLabel || "—"}
                      </span>
                    </span>
                    <span className="max-w-[55%] shrink-0 text-right leading-snug tabular-nums">
                      {mainQty > 0 || spareQty > 0 ? (
                        <>
                          {mainQty > 0 ? (
                            <>
                              <span className="text-[var(--muted-2)]">主件 </span>
                              {mainQty.toLocaleString("zh-CN")} 粒
                            </>
                          ) : null}
                          {mainQty > 0 && spareQty > 0 ? <span className="text-[var(--muted)]"> · </span> : null}
                          {spareQty > 0 ? (
                            <>
                              <span className="text-[var(--muted-2)]">备用 </span>
                              {spareQty.toLocaleString("zh-CN")} 粒
                            </>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[var(--muted-2)]">—</span>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
          {rows.length === 0 ? (
            <li className="empty-state col-span-full text-sm">没有匹配的套装。</li>
          ) : null}
        </ul>
      </div>
      {totalPages > 1 ? (
        <div className="flex justify-end">
          <nav aria-label="官方清单分页" className="pagination-shell">
            {page > 1 ? (
              <Link href={`${actionBase}${qs(page - 1)}`} className="pager-link shrink-0">
                上一页
              </Link>
            ) : (
              <span className="pager-disabled shrink-0">上一页</span>
            )}
            <div className="flex flex-wrap items-center gap-0.5">
              {(() => {
                const seq = pageNavSequence(page, totalPages, 4);
                const mid = Math.floor(seq.length / 2);
                const renderChunk = (chunk: (number | "gap")[], keyBase: number) =>
                  chunk.map((item, i) => {
                    const k = keyBase + i;
                    return item === "gap" ? (
                      <span key={`g-${k}`} className="px-0.5 text-[var(--muted)]" aria-hidden>
                        …
                      </span>
                    ) : item === page ? (
                      <span
                        key={`p-${item}-${k}`}
                        className="pager-current inline-flex min-w-[1.75rem] justify-center"
                        aria-current="page"
                      >
                        {item}
                      </span>
                    ) : (
                      <Link
                        key={`p-${item}-${k}`}
                        href={`${actionBase}${qs(item)}`}
                        className="pager-link inline-flex min-w-[1.75rem] justify-center"
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
                      action={actionBase}
                      className="mx-0.5 inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none ring-[var(--accent)] focus-within:ring-2"
                      title="输入页码后按回车跳转"
                    >
                      {qRaw.trim() ? <input type="hidden" name="q" value={qRaw.trim()} /> : null}
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
              <Link href={`${actionBase}${qs(page + 1)}`} className="pager-link shrink-0">
                下一页
              </Link>
            ) : (
              <span className="pager-disabled shrink-0">下一页</span>
            )}
            <span className="text-[11px] text-[var(--muted)]">
              第 {page}/{totalPages} 页
            </span>
          </nav>
        </div>
      ) : null}
    </section>
  );
}
