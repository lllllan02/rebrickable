import Link from "next/link";
import {
  and,
  asc,
  count,
  countDistinct,
  eq,
  exists,
  inArray,
  isNotNull,
  like,
  min,
  ne,
  notExists,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { PartFavoriteToggle } from "@/app/parts/part-favorite-toggle";
import { PartsCategoryNav } from "@/app/parts/parts-category-nav";
import { PartsDraggableGrid } from "@/app/parts/parts-draggable-grid";
import { PartsGroupNav } from "@/app/parts/parts-group-nav";
import { PartsNavModeSwitch } from "@/app/parts/parts-nav-mode-switch";
import { PartsSearchPanel } from "@/app/parts/parts-search-panel";
import { PurchaseListAddToggle } from "@/app/parts/purchase/purchase-list-add-toggle";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { getCatalogDb } from "@/db/client";
import {
  elements,
  inventoryParts,
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";
import { loadFavoritePartNums } from "@/lib/load-favorite-parts";
import { loadPurchaseListPartNums } from "@/lib/load-purchase-list";
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
import { likeFragment } from "@/lib/search";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

type Props = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    cat?: string;
    piece?: string;
    group?: string;
    by?: string;
  }>;
};

export default async function PartsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qRaw = sp.q ?? "";
  const q = likeFragment(qRaw);
  const navMode = parsePartsNavMode(sp.by);

  const catRaw = (sp.cat ?? "").trim();
  const catIsAll = catRaw === "" || catRaw === "all";
  const catNum = Number.parseInt(catRaw, 10);
  const catNumericOk =
    catIsAll ||
    (Number.isFinite(catNum) && catNum > 0 && String(catNum) === catRaw);
  const invalidCatParam =
    navMode === "cat" && catRaw.length > 0 && !catNumericOk;
  const catIdFilter =
    navMode === "cat" && catNumericOk && !catIsAll && catRaw !== ""
      ? catNum
      : null;

  const pieceRaw = (sp.piece ?? "").trim().toLowerCase();
  const pieceFilter =
    pieceRaw === "plain" || pieceRaw === "printed" ? pieceRaw : null;

  const parsedGroup = parsePartGroupFilter(sp.group);
  const groupFilter: PartGroupFilter =
    navMode === "group" ? (parsedGroup ?? "all") : "all";
  const invalidGroupParam =
    navMode === "group" && parsedGroup == null && (sp.group ?? "").trim() !== "";
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const groupValid =
    navMode !== "group" ||
    invalidGroupParam ||
    (await isPartGroupFilterValid(groupFilter));
  const groupConstraint =
    navMode === "group" && groupValid && !invalidGroupParam
      ? await resolveGroupPartNumConstraint(groupFilter)
      : { kind: "none" as const };
  const groupMeta =
    navMode === "group" && typeof groupFilter === "number"
      ? await loadPartGroupById(groupFilter)
      : null;

  const db = getCatalogDb();

  const clauses: SQL[] = [];
  if (invalidCatParam) clauses.push(sql`0=1`);
  if (invalidGroupParam || (navMode === "group" && !groupValid)) {
    clauses.push(sql`0=1`);
  }
  if (groupConstraint.kind === "include") {
    if (groupConstraint.partNums.size === 0) clauses.push(sql`0=1`);
    else clauses.push(inArray(parts.partNum, [...groupConstraint.partNums]));
  } else if (groupConstraint.kind === "exclude") {
    if (groupConstraint.partNums.size > 0) {
      clauses.push(notInArray(parts.partNum, [...groupConstraint.partNums]));
    }
  }
  if (q.length > 0) {
    const textOr = or(
      like(parts.name, `%${q}%`),
      like(parts.partNum, `%${q}%`),
      exists(
        db
          .select({ e: elements.elementId })
          .from(elements)
          .where(
            and(
              eq(elements.partNum, parts.partNum),
              like(elements.elementId, `%${q}%`)
            )
          )
      )
    );
    if (textOr) clauses.push(textOr);
  }
  if (navMode === "cat" && catIdFilter !== null) {
    clauses.push(eq(parts.partCatId, catIdFilter));
  }
  if (pieceFilter === "printed") {
    const printedExists = exists(
      db
        .select({ c: partRelationships.childPartNum })
        .from(partRelationships)
        .where(
          and(
            eq(partRelationships.relType, "P"),
            eq(partRelationships.childPartNum, parts.partNum)
          )
        )
    );
    if (printedExists) clauses.push(printedExists);
  } else if (pieceFilter === "plain") {
    const plainClause = notExists(
      db
        .select({ c: partRelationships.childPartNum })
        .from(partRelationships)
        .where(
          and(
            eq(partRelationships.relType, "P"),
            eq(partRelationships.childPartNum, parts.partNum)
          )
        )
    );
    if (plainClause) clauses.push(plainClause);
  }
  const where = clauses.length > 0 ? and(...clauses) : undefined;

  const [totalRow, totalAllRow, categoryRows, countRows] = await Promise.all([
    db.select({ c: count() }).from(parts).where(where),
    db.select({ c: count() }).from(parts),
    db
      .select({ id: partCategories.id, name: partCategories.name })
      .from(partCategories)
      .orderBy(asc(partCategories.name)),
    db
      .select({ catId: parts.partCatId, c: count() })
      .from(parts)
      .where(isNotNull(parts.partCatId))
      .groupBy(parts.partCatId),
  ]);

  const total = Number(totalRow[0]?.c ?? 0);
  const totalAll = Number(totalAllRow[0]?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(totalPages, requestedPage);
  const offset = (page - 1) * PAGE_SIZE;

  const countById = new Map<number, number>();
  for (const r of countRows) {
    if (r.catId != null) countById.set(r.catId, Number(r.c ?? 0));
  }
  const navCategories = categoryRows
    .map((c) => ({
      id: c.id,
      name: c.name,
      count: countById.get(c.id) ?? 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

  const filteredCatLabel = invalidCatParam
    ? null
    : catIdFilter !== null
      ? (categoryRows.find((c) => c.id === catIdFilter)?.name ?? "").trim() ||
        `类型 ${catIdFilter}`
      : null;

  const activeCat: "all" | number =
    !invalidCatParam && catIdFilter !== null ? catIdFilter : "all";

  const rows = await db
    .select({
      partNum: parts.partNum,
      name: parts.name,
    })
    .from(parts)
    .where(where)
    .orderBy(asc(parts.partNum))
    .limit(PAGE_SIZE)
    .offset(offset);

  const partNums = rows.map((r) => r.partNum);

  const thumbByPart = new Map<string, string>();
  const elemCountByPart = new Map<string, number>();
  const colorCountByPart = new Map<string, number>();
  const printedPartNums = new Set<string>();
  const matchedElementsByPart = new Map<string, string[]>();
  const elementMatchTruncated = new Set<string>();
  let favoritePartNums = new Set<string>();
  let purchasePartNums = new Set<string>();
  if (partNums.length > 0) {
    const [
      thumbRows,
      elemRows,
      colorRows,
      printedRows,
      matchRows,
      favSet,
      purchaseSet,
    ] = await Promise.all([
        db
          .select({
            partNum: inventoryParts.partNum,
            thumb: min(inventoryParts.imgUrl),
          })
          .from(inventoryParts)
          .where(
            and(
              inArray(inventoryParts.partNum, partNums),
              isNotNull(inventoryParts.imgUrl),
              ne(inventoryParts.imgUrl, "")
            )
          )
          .groupBy(inventoryParts.partNum),
        db
          .select({
            partNum: elements.partNum,
            n: count(elements.elementId),
          })
          .from(elements)
          .where(inArray(elements.partNum, partNums))
          .groupBy(elements.partNum),
        db
          .select({
            partNum: elements.partNum,
            n: countDistinct(elements.colorId),
          })
          .from(elements)
          .where(inArray(elements.partNum, partNums))
          .groupBy(elements.partNum),
        db
          .select({ partNum: partRelationships.childPartNum })
          .from(partRelationships)
          .where(
            and(
              eq(partRelationships.relType, "P"),
              inArray(partRelationships.childPartNum, partNums)
            )
          )
          .groupBy(partRelationships.childPartNum),
        q.length > 0
          ? db
              .select({
                partNum: elements.partNum,
                elementId: elements.elementId,
              })
              .from(elements)
              .where(
                and(
                  inArray(elements.partNum, partNums),
                  like(elements.elementId, `%${q}%`)
                )
              )
              .orderBy(asc(elements.partNum), asc(elements.elementId))
              .limit(1000)
          : Promise.resolve(
              [] as { partNum: string; elementId: string }[]
            ),
        loadFavoritePartNums(partNums),
        loadPurchaseListPartNums(partNums),
      ]);
    favoritePartNums = favSet;
    purchasePartNums = purchaseSet;
    for (const t of thumbRows) {
      if (t.thumb) thumbByPart.set(t.partNum, t.thumb);
    }
    for (const c of elemRows) {
      elemCountByPart.set(c.partNum, Number(c.n));
    }
    for (const c of colorRows) {
      colorCountByPart.set(c.partNum, Number(c.n));
    }
    for (const p of printedRows) {
      printedPartNums.add(p.partNum);
    }
    for (const m of matchRows) {
      const list = matchedElementsByPart.get(m.partNum) ?? [];
      if (list.length < 5) {
        list.push(m.elementId);
        matchedElementsByPart.set(m.partNum, list);
      } else {
        elementMatchTruncated.add(m.partNum);
      }
    }
  }

  const catalogHref = (opts: {
    by?: "cat" | "group";
    cat?: number | null;
    group?: PartGroupFilter;
    page?: number;
  }) => {
    const u = new URLSearchParams();
    if (qRaw.trim()) u.set("q", qRaw.trim());
    if (pieceFilter) u.set("piece", pieceFilter);
    const by = opts.by ?? navMode;
    if (by === "group") {
      u.set("by", "group");
      const g = opts.group ?? "all";
      if (g !== "all") u.set("group", partGroupFilterQueryValue(g));
    } else {
      const cat = opts.cat !== undefined ? opts.cat : catIdFilter;
      if (cat != null) u.set("cat", String(cat));
    }
    if (opts.page != null && opts.page > 1) u.set("page", String(opts.page));
    const s = u.toString();
    return s ? `/parts?${s}` : "/parts";
  };

  const qs = (p: number) => {
    const href = catalogHref({
      by: navMode,
      group: groupFilter,
      page: p,
    });
    const i = href.indexOf("?");
    return i >= 0 ? href.slice(i) : "";
  };

  const groupNavSummary = await loadPartGroupNavSummary(null, totalAll);

  const groupLabel =
    navMode !== "group"
      ? null
      : groupFilter === "ungrouped"
        ? "待分组"
        : groupFilter === "all"
          ? null
          : groupMeta?.name.trim() || `分组 ${groupFilter}`;

  return (
    <div className="page-stack">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-[var(--text)] sm:text-lg">
                零件
                {totalAll > 0 ? (
                  <span className="ml-2 text-sm font-normal tabular-nums text-[var(--muted)]">
                    · {totalAll.toLocaleString("zh-CN")}
                    {(catIdFilter !== null ||
                      q.length > 0 ||
                      pieceFilter ||
                      (navMode === "group" && groupFilter !== "all")) &&
                    total !== totalAll
                      ? ` / 当前 ${total.toLocaleString("zh-CN")}`
                      : null}
                  </span>
                ) : null}
              </h1>
              {filteredCatLabel || groupLabel ? (
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {[filteredCatLabel, groupLabel].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs">
              <Link
                href="/parts/favorites"
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                收藏
              </Link>
              <Link
                href="/parts/purchase"
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                购买清单
              </Link>
              <Link
                href="/parts/owned"
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                零件库
              </Link>
            </div>
          </div>

          {invalidCatParam ? (
            <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
              类型参数无效，请从侧栏重新选择分类。
            </p>
          ) : null}
          {invalidGroupParam || (navMode === "group" && !groupValid) ? (
            <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
              分组不存在或已删除，请从侧栏重新选择。
            </p>
          ) : null}

          <PartsDraggableGrid enabled={navMode === "group"}>
            {rows.map((r) => {
              const thumb = thumbByPart.get(r.partNum);
              const elemCount = elemCountByPart.get(r.partNum) ?? 0;
              const colorCount = colorCountByPart.get(r.partNum) ?? 0;
              const isPrinted = printedPartNums.has(r.partNum);
              const matchedElems = matchedElementsByPart.get(r.partNum) ?? [];
              const title = [
                r.partNum,
                r.name,
                isPrinted ? "印刷件" : "普通零件",
                colorCount > 0 ? `${colorCount} 色` : null,
                elemCount > 0 ? `${elemCount} 元素` : null,
              ]
                .filter(Boolean)
                .join(" · ");
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
                    thumbUrl={thumb}
                    isPrinted={isPrinted}
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
                            initialFavorite={favoritePartNums.has(r.partNum)}
                            compact
                          />
                        </span>
                      </>
                    }
                  >
                    {colorCount > 0 || elemCount > 0 ? (
                      <p className="mt-0.5 truncate px-0.5 text-center text-[9px] tabular-nums text-[var(--muted-2)]">
                        {colorCount > 0 ? `${colorCount} 色` : null}
                        {colorCount > 0 && elemCount > 0 ? " · " : null}
                        {elemCount > 0 ? `${elemCount} 元素` : null}
                      </p>
                    ) : null}
                    {matchedElems.length > 0 ? (
                      <p className="mt-0.5 line-clamp-2 px-0.5 text-center font-mono text-[8px] leading-tight text-[var(--accent)]">
                        {matchedElems.join(" ")}
                        {elementMatchTruncated.has(r.partNum) ? " …" : null}
                      </p>
                    ) : null}
                  </PartGridTileLink>
                </li>
              );
            })}
            {rows.length === 0 ? (
              <li className="empty-state col-span-full list-none text-sm">
                没有匹配的零件。
              </li>
            ) : null}
          </PartsDraggableGrid>
          {totalPages > 1 ? (
            <div className="flex justify-end">
              <nav aria-label="分页" className="pagination-shell">
                {page > 1 ? (
                  <Link
                    href={`/parts${qs(page - 1)}`}
                    className="pager-link shrink-0"
                  >
                    上一页
                  </Link>
                ) : (
                  <span className="pager-disabled shrink-0">上一页</span>
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
                            className="pager-current inline-flex min-w-[1.75rem] justify-center"
                            aria-current="page"
                          >
                            {item}
                          </span>
                        ) : (
                          <Link
                            key={`p-${item}-${k}`}
                            href={`/parts${qs(item)}`}
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
                          action="/parts"
                          className="mx-0.5 inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none ring-[var(--accent)] focus-within:ring-2"
                          title="输入页码后按回车跳转"
                        >
                          {qRaw.trim() ? (
                            <input type="hidden" name="q" value={qRaw.trim()} />
                          ) : null}
                          {catIdFilter !== null ? (
                            <input
                              type="hidden"
                              name="cat"
                              value={String(catIdFilter)}
                            />
                          ) : catRaw === "all" ? (
                            <input type="hidden" name="cat" value="all" />
                          ) : null}
                          {pieceFilter ? (
                            <input
                              type="hidden"
                              name="piece"
                              value={pieceFilter}
                            />
                          ) : null}
                          {navMode === "group" ? (
                            <>
                              <input type="hidden" name="by" value="group" />
                              {groupFilter !== "all" ? (
                                <input
                                  type="hidden"
                                  name="group"
                                  value={partGroupFilterQueryValue(groupFilter)}
                                />
                              ) : null}
                            </>
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
                    href={`/parts${qs(page + 1)}`}
                    className="pager-link shrink-0"
                  >
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
        </div>

        <aside className="space-y-3 lg:sticky lg:top-20">
          <PartsSearchPanel
            q={qRaw}
            piece={pieceFilter}
            catId={catIdFilter}
            by={navMode}
            groupFilter={groupFilter}
          />
          <PartsNavModeSwitch
            mode={navMode}
            hrefCat={catalogHref({ by: "cat", cat: null })}
            hrefGroup={catalogHref({ by: "group", group: "all" })}
          />
          {navMode === "group" ? (
            <PartsGroupNav
              groups={groupNavSummary.groups.map((g) => ({
                ...g,
                href: catalogHref({ by: "group", group: g.id }),
              }))}
              activeFilter={
                invalidGroupParam || !groupValid ? "all" : groupFilter
              }
              hrefAll={catalogHref({ by: "group", group: "all" })}
              hrefUngrouped={catalogHref({
                by: "group",
                group: "ungrouped",
              })}
              totalInScope={groupNavSummary.totalInScope}
              ungroupedCount={groupNavSummary.ungroupedCount}
            />
          ) : (
            <PartsCategoryNav
              total={totalAll}
              categories={navCategories}
              active={activeCat}
              q={qRaw}
              piece={pieceFilter}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
