import Link from "next/link";

import { FavoritePartsCategoryNav } from "@/app/parts/favorites/favorite-parts-category-nav";
import { FavoritePartsQuickAdd } from "@/app/parts/favorites/favorite-parts-quick-add";
import { PartFavoriteToggle } from "@/app/parts/part-favorite-toggle";
import { PartsDraggableGrid } from "@/app/parts/parts-draggable-grid";
import { PartsGroupNav } from "@/app/parts/parts-group-nav";
import { PartsNavModeSwitch } from "@/app/parts/parts-nav-mode-switch";
import { PurchaseListAddToggle } from "@/app/parts/purchase/purchase-list-add-toggle";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import {
  FAVORITE_PARTS_PAGE_SIZE,
  loadFavoriteCategoryLabel,
  loadFavoriteCategorySummary,
  loadFavoritePartNumList,
  loadFavoritePartsPage,
} from "@/lib/load-favorite-parts";
import { loadPurchaseListPartNums } from "@/lib/load-purchase-list";
import {
  ownedCategoryQueryValue,
  parseOwnedCategoryParam,
  type OwnedCategoryFilter,
} from "@/lib/owned-parts-category";
import {
  isPartGroupFilterValid,
  loadPartGroupById,
  loadPartGroupNavSummary,
  parsePartGroupFilter,
  parsePartsNavMode,
  partGroupFilterQueryValue,
  resolveGroupPartNumConstraint,
  type PartGroupFilter,
} from "@/lib/part-groups";
import { pageNavSequence } from "@/lib/page-nav-sequence";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    page?: string;
    cat?: string;
    group?: string;
    by?: string;
  }>;
};

function parseCatFilter(raw: string | undefined): OwnedCategoryFilter {
  const parsed = parseOwnedCategoryParam(raw);
  if (parsed == null) return "all";
  return parsed;
}

function favoritesHref(opts: {
  by?: "cat" | "group";
  cat?: OwnedCategoryFilter;
  group?: PartGroupFilter;
  page?: number;
}): string {
  const u = new URLSearchParams();
  const by = opts.by ?? "cat";
  if (by === "group") {
    u.set("by", "group");
    const group = opts.group ?? "all";
    if (group !== "all") u.set("group", partGroupFilterQueryValue(group));
  } else {
    const cat = opts.cat ?? "all";
    if (cat !== "all") u.set("cat", ownedCategoryQueryValue(cat));
  }
  if (opts.page != null && opts.page > 1) u.set("page", String(opts.page));
  const s = u.toString();
  return s ? `/parts/favorites?${s}` : "/parts/favorites";
}

export default async function FavoritePartsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const navMode = parsePartsNavMode(sp.by);
  const catFilter =
    navMode === "cat" ? parseCatFilter(sp.cat) : ("all" as const);

  const parsedGroup = parsePartGroupFilter(sp.group);
  const invalidGroupParam =
    navMode === "group" &&
    parsedGroup == null &&
    (sp.group ?? "").trim() !== "";
  const groupFilter: PartGroupFilter =
    navMode === "group" ? (parsedGroup ?? "all") : "all";
  const groupValid =
    navMode !== "group" ||
    invalidGroupParam ||
    (await isPartGroupFilterValid(groupFilter));

  const groupConstraint =
    navMode === "group" && groupValid && !invalidGroupParam
      ? await resolveGroupPartNumConstraint(groupFilter)
      : { kind: "none" as const };

  const effectiveConstraint =
    invalidGroupParam || (navMode === "group" && !groupValid)
      ? ({ kind: "include", partNums: new Set<string>() } as const)
      : groupConstraint;

  const catForPage = navMode === "cat" ? catFilter : ("all" as const);

  const [summary, favPartNums, groupMeta] = await Promise.all([
    loadFavoriteCategorySummary(),
    loadFavoritePartNumList(),
    navMode === "group" && typeof groupFilter === "number"
      ? loadPartGroupById(groupFilter)
      : Promise.resolve(null),
  ]);

  const [pageResult, categoryLabel, groupNavSummary] = await Promise.all([
    loadFavoritePartsPage(
      requestedPage,
      FAVORITE_PARTS_PAGE_SIZE,
      catForPage,
      effectiveConstraint
    ),
    navMode === "cat"
      ? loadFavoriteCategoryLabel(catFilter)
      : Promise.resolve(null),
    loadPartGroupNavSummary(favPartNums),
  ]);

  const { total, page, rows } = pageResult;
  const totalPages = Math.max(1, Math.ceil(total / FAVORITE_PARTS_PAGE_SIZE));
  const purchasePartNums = await loadPurchaseListPartNums(
    rows.map((r) => r.partNum)
  );

  const groupLabel =
    navMode !== "group"
      ? null
      : groupFilter === "ungrouped"
        ? "待分组"
        : groupFilter === "all"
          ? null
          : groupMeta?.name.trim() || `分组 ${groupFilter}`;

  const qs = (p: number) => {
    const href = favoritesHref({
      by: navMode,
      cat: catFilter,
      group: groupFilter,
      page: p,
    });
    const i = href.indexOf("?");
    return i >= 0 ? href.slice(i) : "";
  };

  return (
    <div className="page-stack">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-[var(--text)] sm:text-lg">
                零件收藏
                {summary.total > 0 ? (
                  <span className="ml-2 text-sm font-normal tabular-nums text-[var(--muted)]">
                    · {summary.total.toLocaleString("zh-CN")}
                    {((navMode === "cat" && catFilter !== "all") ||
                      (navMode === "group" && groupFilter !== "all")) &&
                    total !== summary.total
                      ? ` / 当前 ${total.toLocaleString("zh-CN")}`
                      : null}
                  </span>
                ) : null}
              </h1>
              {categoryLabel || groupLabel ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {[categoryLabel, groupLabel].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
            <Link
              href="/parts"
              className="shrink-0 text-xs text-[var(--accent)] underline-offset-2 hover:underline"
            >
              ← 零件目录
            </Link>
          </div>

          {invalidGroupParam || (navMode === "group" && !groupValid) ? (
            <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
              分组不存在或已删除，请从侧栏重新选择。
            </p>
          ) : null}

          {summary.total === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              尚未收藏任何零件。可使用侧栏快捷添加，或前往
              <Link
                href="/parts"
                className="mx-1 text-[var(--accent)] underline underline-offset-2"
              >
                零件目录
              </Link>
              浏览并点击 ★ 加入。
            </p>
          ) : total === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              当前筛选下没有收藏零件。
              <Link
                href={favoritesHref({ by: navMode, cat: "all", group: "all" })}
                className="ml-1 text-[var(--accent)] underline underline-offset-2"
              >
                查看全部
              </Link>
            </p>
          ) : (
            <>
              <PartsDraggableGrid enabled={navMode === "group"}>
                {rows.map((r) => {
                  const title = [
                    r.partNum,
                    r.name,
                    r.isPrinted ? "印刷件" : "普通零件",
                  ].join(" · ");
                  return (
                    <li
                      key={r.partNum}
                      className="min-w-0"
                      data-part-num={r.partNum}
                    >
                      <PartGridTileLink
                        href={`/parts/${encodeURIComponent(r.partNum)}`}
                        titleAttr={title}
                        partNum={r.partNum}
                        thumbUrl={r.thumbUrl}
                        isPrinted={r.isPrinted}
                        topRight={
                          <>
                            <span className="absolute left-0.5 top-0.5 z-[2]">
                              <PurchaseListAddToggle
                                partNum={r.partNum}
                                initialInList={purchasePartNums.has(r.partNum)}
                                compact
                              />
                            </span>
                            <span className="absolute right-0.5 top-0.5 z-[2]">
                              <PartFavoriteToggle
                                partNum={r.partNum}
                                initialFavorite
                                compact
                              />
                            </span>
                          </>
                        }
                      >
                        <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
                          {r.name}
                        </p>
                      </PartGridTileLink>
                    </li>
                  );
                })}
              </PartsDraggableGrid>
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

        <aside className="space-y-3 lg:sticky lg:top-20">
          <FavoritePartsQuickAdd />
          <PartsNavModeSwitch
            mode={navMode}
            hrefCat={favoritesHref({ by: "cat", cat: "all" })}
            hrefGroup={favoritesHref({ by: "group", group: "all" })}
          />
          {navMode === "group" ? (
            <PartsGroupNav
              groups={groupNavSummary.groups.map((g) => ({
                ...g,
                href: favoritesHref({ by: "group", group: g.id }),
              }))}
              activeFilter={
                invalidGroupParam || !groupValid ? "all" : groupFilter
              }
              hrefAll={favoritesHref({ by: "group", group: "all" })}
              hrefUngrouped={favoritesHref({
                by: "group",
                group: "ungrouped",
              })}
              totalInScope={groupNavSummary.totalInScope}
              ungroupedCount={groupNavSummary.ungroupedCount}
            />
          ) : summary.total > 0 ? (
            <FavoritePartsCategoryNav
              total={summary.total}
              categories={summary.categories}
              uncategorizedCount={summary.uncategorizedCount}
              active={catFilter}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
