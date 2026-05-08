import Image from "next/image";
import Link from "next/link";
import {
  and,
  asc,
  count,
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

  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

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

  const [totalRow, rows, categoryOptions] = await Promise.all([
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
    db
      .select({ id: partCategories.id, name: partCategories.name })
      .from(partCategories)
      .orderBy(asc(partCategories.name)),
  ]);

  const partNums = rows.map((r) => r.partNum);

  const thumbByPart = new Map<string, string>();
  const elemCountByPart = new Map<string, number>();
  const matchedElementsByPart = new Map<string, string[]>();
  const elementMatchTruncated = new Set<string>();

  if (partNums.length > 0) {
    const [thumbRows, countRows, matchRows] = await Promise.all([
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

  const total = totalRow[0]?.c ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
          共 {Number(total).toLocaleString("zh-CN")}{" "}
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
      <ul className="space-y-2">
        {rows.map((r) => {
          const thumb = thumbByPart.get(r.partNum);
          const elemCount = elemCountByPart.get(r.partNum) ?? 0;
          const matchedElems = matchedElementsByPart.get(r.partNum) ?? [];
          return (
            <li
              key={r.partNum}
              className="flex gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
                {thumb ? (
                  <Image
                    src={thumb}
                    alt=""
                    width={80}
                    height={80}
                    className="box-border h-full w-full object-contain p-1"
                    sizes="80px"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]"
                    title="库存中暂无图片"
                  >
                    无图
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <Link
                    href={`/parts/${encodeURIComponent(r.partNum)}`}
                    className="font-mono text-sm font-semibold text-[var(--accent)]"
                  >
                    {r.partNum}
                  </Link>
                  {elemCount > 0 ? (
                    <span className="text-xs text-[var(--muted)]">
                      {elemCount.toLocaleString("zh-CN")} 个元素
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm leading-snug">{r.name}</p>
                <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--muted)]">
                  {r.catName ? (
                    <div>
                      <dt className="inline text-[var(--text)]">分类</dt>{" "}
                      <dd className="inline">{r.catName}</dd>
                    </div>
                  ) : null}
                  {r.material ? (
                    <div>
                      <dt className="inline text-[var(--text)]">材质</dt>{" "}
                      <dd className="inline">{r.material}</dd>
                    </div>
                  ) : null}
                  {r.catId != null ? (
                    <div>
                      <dt className="inline text-[var(--text)]">分类 ID</dt>{" "}
                      <dd className="inline font-mono">{r.catId}</dd>
                    </div>
                  ) : null}
                </dl>
                {matchedElems.length > 0 ? (
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-[var(--accent)]">
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
          <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-8 text-center text-sm text-[var(--muted)]">
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
