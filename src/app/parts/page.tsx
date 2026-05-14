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
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { getCatalogDb } from "@/db/client";
import {
  buildOwnedSubjects,
  elements,
  inventoryParts,
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";
import { OWNED_SUBJECT_PART } from "@/lib/build-owned-subject";
import { PART_GRID_TILE_OWNED_HIGHLIGHT } from "@/lib/part-grid-tile-classes";
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

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

type PartCategoryPickerRow = { id: number; name: string };

function PartsCategoryPickerGrid({
  categories,
  countById,
  heroByCatId,
}: {
  categories: PartCategoryPickerRow[];
  countById: Map<number, number>;
  heroByCatId: Map<number, string | null>;
}) {
  const list = categories
    .filter((c) => (countById.get(c.id) ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  if (list.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">暂无带分类的零件数据。</p>
    );
  }

  return (
    <ul
      className="list-cards-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
      role="list"
    >
      {list.map((c) => {
        const n = countById.get(c.id) ?? 0;
        const href = `/parts?cat=${encodeURIComponent(String(c.id))}`;
        const hero = heroByCatId.get(c.id) ?? null;
        return (
          <li
            key={c.id}
            className="result-card flex min-w-0 flex-col gap-0 overflow-hidden p-0"
          >
            <Link
              href={href}
              className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]"
              aria-label={`${c.name} 示意缩略图`}
            >
              {usableImgUrl(hero) ? (
                <RemoteCoverImage
                  src={hero.trim()}
                  fill
                  className="object-contain p-2 sm:p-3"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
                  alt=""
                  fallbackLabel="无图"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-sm text-[var(--muted)]">
                  无预览图
                </span>
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
              <div className="min-w-0">
                <Link
                  href={href}
                  className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                >
                  {c.name}
                </Link>
                <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                  {n.toLocaleString("zh-CN")} 条
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Props = {
  searchParams: Promise<{
    q?: string;
    page?: string;
    cat?: string;
    piece?: string;
  }>;
};

export default async function PartsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qRaw = sp.q ?? "";
  const q = likeFragment(qRaw);
  const catRaw = (sp.cat ?? "").trim();
  const catIsAll = catRaw === "all";
  const catNum = Number.parseInt(catRaw, 10);
  const catNumericOk =
    catRaw === "" ||
    catIsAll ||
    (Number.isFinite(catNum) && catNum > 0 && String(catNum) === catRaw);
  const invalidCatParam = catRaw.length > 0 && !catNumericOk;
  const catIdFilter =
    catNumericOk && !catIsAll && catRaw !== "" ? catNum : null;

  const pieceRaw = (sp.piece ?? "").trim().toLowerCase();
  const pieceFilter =
    pieceRaw === "plain" || pieceRaw === "printed" ? pieceRaw : null;

  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const showCategoryPicker =
    catRaw === "" && q.length === 0 && pieceFilter === null;

  const db = getCatalogDb();

  if (showCategoryPicker) {
    const [totalAllRow, categoryRows, countRows, heroRows] = await Promise.all([
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
      db
        .select({
          catId: parts.partCatId,
          thumb: min(inventoryParts.imgUrl),
        })
        .from(parts)
        .innerJoin(inventoryParts, eq(parts.partNum, inventoryParts.partNum))
        .where(
          and(
            isNotNull(parts.partCatId),
            isNotNull(inventoryParts.imgUrl),
            ne(inventoryParts.imgUrl, "")
          )
        )
        .groupBy(parts.partCatId),
    ]);

    const totalAll = Number(totalAllRow[0]?.c ?? 0);
    const countById = new Map<number, number>();
    for (const r of countRows) {
      if (r.catId != null) countById.set(r.catId, Number(r.c ?? 0));
    }
    const heroByCatId = new Map<number, string | null>();
    for (const r of heroRows) {
      if (r.catId != null && r.thumb?.trim()) {
        heroByCatId.set(r.catId, r.thumb.trim());
      }
    }

    return (
      <div className="page-stack">
        <section className="space-y-4" aria-labelledby="parts-catalog-heading">
          <div>
            <p className="page-kicker">Parts</p>
            <h1 id="parts-catalog-heading" className="page-title">
              零件
            </h1>
            <p className="mt-3 text-sm text-[var(--muted)]">
              请先选择零件类型（分类）以浏览该类下的列表；也可通过全库入口不按类型筛选，并配合关键词或普通/印刷筛选。卡片配图为该类型下清单中的零件示意图。
            </p>
          </div>
          <div className="table-shell p-4 sm:p-5">
            <div className="mb-6 flex flex-wrap gap-3">
              <Link
                href="/parts?cat=all"
                className="result-card inline-flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
              >
                <span className="text-sm font-semibold text-[var(--text)]">全库浏览</span>
                <span className="text-xs text-[var(--muted)]">
                  不按类型筛选，可配合关键词与普通/印刷筛选（共{" "}
                  {totalAll.toLocaleString("zh-CN")} 条零件）
                </span>
              </Link>
            </div>
            <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">按分类浏览</h2>
            <PartsCategoryPickerGrid
              categories={categoryRows}
              countById={countById}
              heroByCatId={heroByCatId}
            />
          </div>
        </section>
      </div>
    );
  }

  const clauses: SQL[] = [];
  if (invalidCatParam) clauses.push(sql`0=1`);
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
  if (catIdFilter !== null) {
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

  const [totalRow, categoryOptions] = await Promise.all([
    db.select({ c: count() }).from(parts).where(where),
    db
      .select({ id: partCategories.id, name: partCategories.name })
      .from(partCategories)
      .orderBy(asc(partCategories.name)),
  ]);

  const total = Number(totalRow[0]?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(totalPages, requestedPage);
  const offset = (page - 1) * PAGE_SIZE;

  const filteredCatLabel = invalidCatParam
    ? null
    : catIsAll
      ? "全库"
      : catIdFilter !== null
        ? (categoryOptions.find((c) => c.id === catIdFilter)?.name ?? "").trim() ||
          `类型 ${catIdFilter}`
        : null;

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
  const ownedPartNums = new Set<string>();

  if (partNums.length > 0) {
    const [thumbRows, countRows, colorRows, printedRows, matchRows, ownedRows] =
      await Promise.all([
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
        db
          .select({ subjectId: buildOwnedSubjects.subjectId })
          .from(buildOwnedSubjects)
          .where(
            and(
              eq(buildOwnedSubjects.subjectKind, OWNED_SUBJECT_PART),
              inArray(buildOwnedSubjects.subjectId, partNums)
            )
          ),
      ]);

    for (const o of ownedRows) {
      ownedPartNums.add(o.subjectId);
    }
    for (const t of thumbRows) {
      if (t.thumb) thumbByPart.set(t.partNum, t.thumb);
    }
    for (const c of countRows) {
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

  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (qRaw.trim()) u.set("q", qRaw.trim());
    if (catIsAll) u.set("cat", "all");
    else if (catIdFilter !== null) u.set("cat", String(catIdFilter));
    if (pieceFilter) u.set("piece", pieceFilter);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="page-kicker">Parts</p>
            <h1 className="page-title">零件</h1>
            {filteredCatLabel != null ? (
              <p className="mt-1 text-base font-normal text-[var(--muted)]">
                {filteredCatLabel}
              </p>
            ) : null}
          </div>
          <Link
            href="/parts"
            className="shrink-0 text-sm text-[var(--accent)] underline-offset-2 hover:underline"
          >
            ← 选择分类
          </Link>
        </div>
        <p className="page-description mt-3">
          当前列表共 {total.toLocaleString("zh-CN")}{" "}
          条；类型与普通/印刷筛选变更会立即生效。印刷件指在零件关系表中作为子件且 rel_type 为 P
          的条目（印于基件）。关键词支持名称、part_num 或 element_id。
        </p>
      </section>
      {invalidCatParam ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
          类型参数无效，请从{" "}
          <Link href="/parts" className="text-[var(--accent)] underline-offset-2 hover:underline">
            分类列表
          </Link>{" "}
          重新选择。
        </p>
      ) : null}
      <form method="get" className="filter-bar">
        <label className="sr-only" htmlFor="parts-cat">
          零件类型
        </label>
        <AutoSubmitSelect
          id="parts-cat"
          name="cat"
          defaultValue={catIdFilter !== null ? String(catIdFilter) : "all"}
          className="field max-w-full text-sm sm:max-w-[220px]"
        >
          <option value="all">全部分类</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </AutoSubmitSelect>
        <label className="sr-only" htmlFor="parts-piece">
          普通或印刷
        </label>
        <AutoSubmitSelect
          id="parts-piece"
          name="piece"
          defaultValue={pieceFilter ?? ""}
          className="field max-w-full text-sm sm:max-w-[160px]"
        >
          <option value="">全部零件</option>
          <option value="plain">普通零件</option>
          <option value="printed">印刷件</option>
        </AutoSubmitSelect>
        <input
          name="q"
          defaultValue={qRaw}
          placeholder="名称、part_num 或 element_id…"
          className="field min-w-[200px] flex-1 text-sm"
        />
        <button type="submit" className="button-primary text-sm">
          搜索
        </button>
      </form>
      <ul className="tiles-grid" role="list">
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
            <li key={r.partNum} className="min-w-0">
              <PartGridTileLink
                href={`/parts/${encodeURIComponent(r.partNum)}`}
                titleAttr={title}
                partNum={r.partNum}
                thumbUrl={thumb}
                isPrinted={isPrinted}
                extraTileClass={ownedPartNums.has(r.partNum) ? PART_GRID_TILE_OWNED_HIGHLIGHT : ""}
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
      </ul>
      {totalPages > 1 ? (
        <div className="flex justify-end">
          <nav
            aria-label="分页"
            className="pagination-shell"
          >
            {page > 1 ? (
              <Link
                href={`/parts${qs(page - 1)}`}
                className="pager-link shrink-0"
              >
                上一页
              </Link>
            ) : (
              <span className="pager-disabled shrink-0">
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
                      {catIsAll ? (
                        <input type="hidden" name="cat" value="all" />
                      ) : catIdFilter !== null ? (
                        <input
                          type="hidden"
                          name="cat"
                          value={String(catIdFilter)}
                        />
                      ) : null}
                      {pieceFilter ? (
                        <input type="hidden" name="piece" value={pieceFilter} />
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
                      <button
                        type="submit"
                        className="sr-only"
                      >
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
              <span className="pager-disabled shrink-0">
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
