import Link from "next/link";

import { OwnedPartsCategoryNav } from "@/app/parts/owned/owned-parts-category-nav";
import { OwnedPartsSortControl } from "@/app/parts/owned/owned-parts-sort-control";
import { OwnedPartsTiles } from "@/app/parts/owned/owned-parts-tiles";
import { ownedPartsHref } from "@/lib/owned-parts-href";
import {
  OWNED_PARTS_PAGE_SIZE,
  loadOwnedCategoryLabel,
  loadOwnedCategorySummary,
  loadOwnedElementsPage,
  loadOwnedPartsPage,
  parseOwnedSortState,
  parseOwnedViewParam,
  type OwnedElementPageRow,
  type OwnedPartPageRow,
} from "@/lib/load-owned-parts";
import {
  parseOwnedCategoryParam,
  type OwnedCategoryFilter,
} from "@/lib/owned-parts-category";
import { pageNavSequence } from "@/lib/page-nav-sequence";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    page?: string;
    cat?: string;
    view?: string;
    sort?: string;
    dir?: string;
  }>;
};

function parseCatFilter(raw: string | undefined): OwnedCategoryFilter {
  const parsed = parseOwnedCategoryParam(raw);
  if (parsed == null) return "all";
  return parsed;
}

export default async function OwnedPartsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const catFilter = parseCatFilter(sp.cat);
  const view = parseOwnedViewParam(sp.view);
  const sort = parseOwnedSortState(sp.sort, sp.dir);

  const [summary, categoryLabel, partPage, elementPage] = await Promise.all([
    loadOwnedCategorySummary(),
    loadOwnedCategoryLabel(catFilter),
    view === "part"
      ? loadOwnedPartsPage(
          requestedPage,
          OWNED_PARTS_PAGE_SIZE,
          catFilter,
          sort
        )
      : Promise.resolve({ total: 0, page: 1, rows: [] as OwnedPartPageRow[] }),
    view === "element"
      ? loadOwnedElementsPage(
          requestedPage,
          OWNED_PARTS_PAGE_SIZE,
          catFilter,
          sort
        )
      : Promise.resolve({
          total: 0,
          page: 1,
          rows: [] as OwnedElementPageRow[],
        }),
  ]);

  const total = view === "element" ? elementPage.total : partPage.total;
  const page = view === "element" ? elementPage.page : partPage.page;
  const totalPages = Math.max(1, Math.ceil(total / OWNED_PARTS_PAGE_SIZE));

  return (
    <div className="page-stack">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-[var(--text)] sm:text-lg">
                零件库
                {summary.total > 0 ? (
                  <span className="ml-2 text-sm font-normal tabular-nums text-[var(--muted)]">
                    · {summary.total.toLocaleString("zh-CN")} 种
                    {summary.stats.totalQty > 0
                      ? ` · ${summary.stats.totalQty.toLocaleString("zh-CN")} 粒`
                      : null}
                    {view === "element" && total > 0
                      ? catFilter !== "all"
                        ? ` / 本类 ${total.toLocaleString("zh-CN")} 元素`
                        : ` · ${total.toLocaleString("zh-CN")} 元素`
                      : catFilter !== "all" && total !== summary.total
                        ? ` / 本类 ${total.toLocaleString("zh-CN")}`
                        : null}
                  </span>
                ) : null}
              </h1>
              {categoryLabel ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">{categoryLabel}</p>
              ) : null}
            </div>
            <Link
              href="/parts"
              className="shrink-0 text-xs text-[var(--accent)] underline-offset-2 hover:underline"
            >
              ← 零件目录
            </Link>
          </div>

          {summary.total > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div
                className="inline-flex rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-0.5 text-xs"
                role="group"
                aria-label="展示粒度"
              >
                <Link
                  href={ownedPartsHref({ view: "part", cat: catFilter, sort })}
                  aria-current={view === "part" ? "page" : undefined}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    view === "part"
                      ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  零件
                </Link>
                <Link
                  href={ownedPartsHref({
                    view: "element",
                    cat: catFilter,
                    sort,
                  })}
                  aria-current={view === "element" ? "page" : undefined}
                  className={`rounded px-2.5 py-1 transition-colors ${
                    view === "element"
                      ? "bg-[var(--accent-soft)] font-medium text-[var(--text)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  元素
                </Link>
              </div>
              <OwnedPartsSortControl
                view={view}
                cat={catFilter}
                sortState={sort}
              />
            </div>
          ) : null}

          {summary.total === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              零件库尚无记录。可在
              <Link
                href="/parts"
                className="mx-1 text-[var(--accent)] underline underline-offset-2"
              >
                零件详情
              </Link>
              的元素旁填写购入数量，或对已「拥有」的官方套装执行「杀肉」。
            </p>
          ) : total === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              当前分类下没有零件库记录。
              <Link
                href={ownedPartsHref({ view, cat: "all", sort })}
                className="ml-1 text-[var(--accent)] underline underline-offset-2"
              >
                查看全部
              </Link>
            </p>
          ) : (
            <>
              <OwnedPartsTiles
                view={view}
                partRows={partPage.rows}
                elementRows={elementPage.rows}
              />
              {totalPages > 1 ? (
                <div className="flex justify-end">
                  <nav aria-label="分页" className="pagination-shell">
                    {page > 1 ? (
                      <Link
                        href={ownedPartsHref({
                          view,
                          cat: catFilter,
                          sort,
                          page: page - 1,
                        })}
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
                            href={ownedPartsHref({
                              view,
                              cat: catFilter,
                              sort,
                              page: item,
                            })}
                            className="pager-link inline-flex min-w-[1.75rem] justify-center"
                          >
                            {item}
                          </Link>
                        )
                      )}
                    </div>
                    {page < totalPages ? (
                      <Link
                        href={ownedPartsHref({
                          view,
                          cat: catFilter,
                          sort,
                          page: page + 1,
                        })}
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

        <aside className="space-y-3 lg:sticky lg:top-20">
          {summary.total > 0 ? (
            <OwnedPartsCategoryNav
              total={summary.total}
              categories={summary.categories}
              uncategorizedCount={summary.uncategorizedCount}
              active={catFilter}
              view={view}
              sort={sort}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
