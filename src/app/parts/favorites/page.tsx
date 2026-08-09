import Link from "next/link";

import { PartFavoriteToggle } from "@/app/parts/part-favorite-toggle";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import {
  FAVORITE_PARTS_PAGE_SIZE,
  loadFavoritePartsPage,
} from "@/lib/load-favorite-parts";
import { pageNavSequence } from "@/lib/page-nav-sequence";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function FavoritePartsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { total, page, rows } = await loadFavoritePartsPage(
    requestedPage,
    FAVORITE_PARTS_PAGE_SIZE
  );
  const totalPages = Math.max(1, Math.ceil(total / FAVORITE_PARTS_PAGE_SIZE));

  const qs = (p: number) => (p > 1 ? `?page=${p}` : "");

  return (
    <div className="page-stack">
      <header className="hero-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="page-kicker">本地标记</p>
            <h1 className="page-title text-xl sm:text-2xl">零件收藏</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
              在
              <Link
                href="/parts"
                className="mx-1 text-[var(--accent)] underline underline-offset-2"
              >
                零件目录
              </Link>
              或详情页点击 ★ 加入收藏；与零件库库存无关。
            </p>
            {total > 0 ? (
              <p className="mt-2 text-sm tabular-nums text-[var(--text)]">
                共 {total.toLocaleString("zh-CN")} 件收藏
              </p>
            ) : null}
          </div>
          <Link
            href="/parts"
            className="shrink-0 text-sm text-[var(--accent)] underline-offset-2 hover:underline"
          >
            ← 零件目录
          </Link>
        </div>
      </header>

      {total === 0 ? (
        <section className="section-panel">
          <p className="text-sm text-[var(--muted)]">
            尚未收藏任何零件。前往
            <Link
              href="/parts"
              className="mx-1 text-[var(--accent)] underline underline-offset-2"
            >
              零件目录
            </Link>
            浏览并点击 ★ 即可加入。
          </p>
        </section>
      ) : (
        <>
          <ul className="tiles-grid" role="list">
            {rows.map((r) => {
              const title = [
                r.partNum,
                r.name,
                r.isPrinted ? "印刷件" : "普通零件",
              ].join(" · ");
              return (
                <li key={r.partNum} className="min-w-0">
                  <PartGridTileLink
                    href={`/parts/${encodeURIComponent(r.partNum)}`}
                    titleAttr={title}
                    partNum={r.partNum}
                    thumbUrl={r.thumbUrl}
                    isPrinted={r.isPrinted}
                    topRight={
                      <span className="absolute right-0.5 top-0.5 z-[2]">
                        <PartFavoriteToggle
                          partNum={r.partNum}
                          initialFavorite
                          compact
                        />
                      </span>
                    }
                  >
                    <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
                      {r.name}
                    </p>
                  </PartGridTileLink>
                </li>
              );
            })}
          </ul>
          {totalPages > 1 ? (
            <div className="flex justify-end">
              <nav aria-label="分页" className="pagination-shell">
                {page > 1 ? (
                  <Link
                    href={`/parts/favorites${qs(page - 1)}`}
                    className="pager-link shrink-0"
                  >
                    上一页
                  </Link>
                ) : (
                  <span className="pager-disabled shrink-0">上一页</span>
                )}
                <div className="flex flex-wrap items-center gap-0.5">
                  {pageNavSequence(page, totalPages, 4).map((item, i) =>
                    item === "gap" ? (
                      <span
                        key={`g-${i}`}
                        className="px-0.5 text-[var(--muted)]"
                        aria-hidden
                      >
                        …
                      </span>
                    ) : item === page ? (
                      <span
                        key={`p-${item}`}
                        className="pager-current inline-flex min-w-[1.75rem] justify-center"
                        aria-current="page"
                      >
                        {item}
                      </span>
                    ) : (
                      <Link
                        key={`p-${item}`}
                        href={`/parts/favorites${qs(item)}`}
                        className="pager-link inline-flex min-w-[1.75rem] justify-center"
                      >
                        {item}
                      </Link>
                    )
                  )}
                </div>
                {page < totalPages ? (
                  <Link
                    href={`/parts/favorites${qs(page + 1)}`}
                    className="pager-link shrink-0"
                  >
                    下一页
                  </Link>
                ) : (
                  <span className="pager-disabled shrink-0">下一页</span>
                )}
              </nav>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
