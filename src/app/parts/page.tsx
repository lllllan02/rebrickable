import Image from "next/image";
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
  type SQL,
} from "drizzle-orm";

import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { getDb } from "@/db/client";
import {
  elements,
  inventoryParts,
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";
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
  const catNum = Number.parseInt(catRaw, 10);
  const catIdFilter =
    catRaw !== "" && Number.isFinite(catNum) && catNum > 0 ? catNum : null;

  const pieceRaw = (sp.piece ?? "").trim().toLowerCase();
  const pieceFilter =
    pieceRaw === "plain" || pieceRaw === "printed" ? pieceRaw : null;

  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const db = getDb();

  const clauses: SQL[] = [];
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

  const rows = await db
    .select({
      partNum: parts.partNum,
      name: parts.name,
      catName: partCategories.name,
    })
    .from(parts)
    .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
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

  if (partNums.length > 0) {
    const [thumbRows, countRows, colorRows, printedRows, matchRows] =
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
      ]);

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
    if (catIdFilter !== null) u.set("cat", String(catIdFilter));
    if (pieceFilter) u.set("piece", pieceFilter);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">零件</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          共 {total.toLocaleString("zh-CN")}{" "}
          条；分类与普通/印刷筛选变更会立即生效。印刷件指在零件关系表中作为子件且
          rel_type 为 P 的条目（印于基件）。关键词支持名称、part_num 或
          element_id。
        </p>
      </div>
      <form method="get" className="flex flex-wrap items-stretch gap-2">
        <label className="sr-only" htmlFor="parts-cat">
          零件类型
        </label>
        <AutoSubmitSelect
          id="parts-cat"
          name="cat"
          defaultValue={catIdFilter !== null ? String(catIdFilter) : ""}
          className="max-w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-2 sm:max-w-[220px]"
        >
          <option value="">全部类型</option>
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
          className="max-w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-[var(--accent)] focus:ring-2 sm:max-w-[160px]"
        >
          <option value="">全部零件</option>
          <option value="plain">普通零件</option>
          <option value="printed">印刷件</option>
        </AutoSubmitSelect>
        <input
          name="q"
          defaultValue={qRaw}
          placeholder="名称、part_num 或 element_id…"
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
          const thumb = thumbByPart.get(r.partNum);
          const elemCount = elemCountByPart.get(r.partNum) ?? 0;
          const colorCount = colorCountByPart.get(r.partNum) ?? 0;
          const isPrinted = printedPartNums.has(r.partNum);
          const matchedElems = matchedElementsByPart.get(r.partNum) ?? [];
          return (
            <li
              key={r.partNum}
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
                    title="库存中暂无图片"
                  >
                    无图
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <Link
                    href={`/parts/${encodeURIComponent(r.partNum)}`}
                    className="font-mono text-xs font-semibold text-[var(--accent)] sm:text-[13px]"
                  >
                    {r.partNum}
                  </Link>
                  <span
                    className={
                      isPrinted
                        ? "rounded px-1 py-px text-[10px] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                        : "rounded bg-[var(--bg)] px-1 py-px text-[10px] text-[var(--muted)] ring-1 ring-[var(--border)]"
                    }
                    title={
                      isPrinted
                        ? "在关系表中作为子件且 rel_type 为 P"
                        : "非印刷子件关系"
                    }
                  >
                    {isPrinted ? "印刷件" : "普通零件"}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--text)]">
                  {r.name}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--muted)]">
                  {colorCount > 0 ? (
                    <span>{colorCount.toLocaleString("zh-CN")} 色</span>
                  ) : null}
                  {elemCount > 0 ? (
                    <span>{elemCount.toLocaleString("zh-CN")} 元素</span>
                  ) : null}
                  {r.catName ? (
                    <span className="min-w-0 truncate" title={r.catName}>
                      {r.catName}
                    </span>
                  ) : null}
                </div>
                {matchedElems.length > 0 ? (
                  <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-[var(--accent)]">
                    匹配 element_id：
                    {matchedElems.join(" · ")}
                    {elementMatchTruncated.has(r.partNum) ? " …" : null}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="col-span-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-8 text-center text-sm text-[var(--muted)]">
            没有匹配的零件。
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
                href={`/parts${qs(page - 1)}`}
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
                        href={`/parts${qs(item)}`}
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
                      action="/parts"
                      className="mx-0.5 inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded border border-[var(--border)] bg-[var(--bg)] outline-none ring-[var(--accent)] focus-within:ring-2"
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
