import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull, min, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  colors,
  elements,
  inventories,
  inventoryParts,
  parts,
  partCategories,
  partRelationships,
} from "@/db/schema";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ partNum: string }> };

export default async function PartDetailPage({ params }: Props) {
  const { partNum: raw } = await params;
  const partNum = decodeURIComponent(raw);

  const db = getDb();
  const [row] = await db
    .select({
      partNum: parts.partNum,
      name: parts.name,
      catId: parts.partCatId,
      material: parts.partMaterial,
      catName: partCategories.name,
    })
    .from(parts)
    .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
    .where(eq(parts.partNum, partNum))
    .limit(1);

  if (!row) notFound();

  const imgClause = and(
    eq(inventoryParts.partNum, partNum),
    isNotNull(inventoryParts.imgUrl),
    ne(inventoryParts.imgUrl, "")
  );

  const [asParent, asChild, elemRows, setRows, heroThumbRow, colorThumbRows] =
    await Promise.all([
      db
        .select({
          relType: partRelationships.relType,
          child: partRelationships.childPartNum,
        })
        .from(partRelationships)
        .where(eq(partRelationships.parentPartNum, partNum))
        .orderBy(
          asc(partRelationships.relType),
          asc(partRelationships.childPartNum)
        )
        .limit(200),
      db
        .select({
          relType: partRelationships.relType,
          parent: partRelationships.parentPartNum,
        })
        .from(partRelationships)
        .where(eq(partRelationships.childPartNum, partNum))
        .orderBy(
          asc(partRelationships.relType),
          asc(partRelationships.parentPartNum)
        )
        .limit(200),
      db
        .select({
          elementId: elements.elementId,
          colorId: elements.colorId,
          colorName: colors.name,
          rgb: colors.rgb,
          designId: elements.designId,
        })
        .from(elements)
        .innerJoin(colors, eq(elements.colorId, colors.id))
        .where(eq(elements.partNum, partNum))
        .orderBy(asc(elements.colorId))
        .limit(120),
      db
        .selectDistinct({ setNum: inventories.setNum })
        .from(inventoryParts)
        .innerJoin(
          inventories,
          eq(inventoryParts.inventoryId, inventories.id)
        )
        .where(eq(inventoryParts.partNum, partNum))
        .orderBy(asc(inventories.setNum))
        .limit(80),
      db
        .select({ thumb: min(inventoryParts.imgUrl) })
        .from(inventoryParts)
        .where(imgClause),
      db
        .select({
          colorId: inventoryParts.colorId,
          thumb: min(inventoryParts.imgUrl),
        })
        .from(inventoryParts)
        .where(imgClause)
        .groupBy(inventoryParts.colorId),
    ]);

  const heroThumb = heroThumbRow[0]?.thumb ?? null;
  const thumbByColor = new Map<number, string>();
  for (const t of colorThumbRows) {
    if (t.thumb) thumbByColor.set(t.colorId, t.thumb);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-[var(--muted)]">
          <Link href="/parts" className="no-underline">
            ← 零件列表
          </Link>
        </p>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="relative mx-auto aspect-square w-full max-w-[min(100%,16rem)] shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] sm:mx-0 sm:w-56">
            {heroThumb ? (
              <Image
                src={heroThumb}
                alt={`${row.partNum} 零件图`}
                width={224}
                height={224}
                className="box-border h-full w-full object-contain p-3"
                sizes="(max-width: 640px) 100vw, 224px"
                priority
              />
            ) : (
              <div
                className="flex aspect-square h-full min-h-[12rem] w-full items-center justify-center px-4 text-center text-sm text-[var(--muted)]"
                title="库存中暂无图片"
              >
                无图
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-mono text-2xl font-semibold text-[var(--accent)]">
              {row.partNum}
            </h1>
            <p className="mt-1 text-lg">{row.name}</p>
            <dl className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--muted)]">
              {row.catName ? (
                <div>
                  <dt className="inline text-[var(--text)]">分类：</dt>
                  <dd className="inline">{row.catName}</dd>
                </div>
              ) : null}
              {row.material ? (
                <div>
                  <dt className="inline text-[var(--text)]">材质：</dt>
                  <dd className="inline">{row.material}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">颜色 / 元素</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {elemRows.map((e) => {
            const colorThumb = thumbByColor.get(e.colorId);
            return (
              <li
                key={e.elementId}
                className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]">
                  {colorThumb ? (
                    <Image
                      src={colorThumb}
                      alt=""
                      width={56}
                      height={56}
                      className="box-border h-full w-full object-contain p-0.5"
                      sizes="56px"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-[10px] leading-tight text-[var(--muted)]"
                      title="库存中暂无图片"
                    >
                      无图
                    </div>
                  )}
                </div>
                <span
                  className="h-8 w-8 shrink-0 rounded border border-[var(--border)]"
                  style={{ background: `#${e.rgb}` }}
                  title={e.rgb}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.colorName}</div>
                  <div className="font-mono text-xs text-[var(--muted)]">
                    {e.elementId} · color {e.colorId}
                    {e.designId ? ` · design ${e.designId}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {elemRows.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">暂无元素记录。</p>
        ) : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-medium">子零件（本件为父）</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {asParent.map((r) => (
              <li key={`${r.relType}-${r.child}`}>
                <span className="text-[var(--muted)]">{r.relType}</span>{" "}
                <Link
                  href={`/parts/${encodeURIComponent(r.child)}`}
                  className="font-mono no-underline"
                >
                  {r.child}
                </Link>
              </li>
            ))}
            {asParent.length === 0 ? (
              <li className="text-[var(--muted)]">无</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium">父零件（本件为子）</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {asChild.map((r) => (
              <li key={`${r.relType}-${r.parent}`}>
                <span className="text-[var(--muted)]">{r.relType}</span>{" "}
                <Link
                  href={`/parts/${encodeURIComponent(r.parent)}`}
                  className="font-mono no-underline"
                >
                  {r.parent}
                </Link>
              </li>
            ))}
            {asChild.length === 0 ? (
              <li className="text-[var(--muted)]">无</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">出现的套装（抽样）</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {setRows.map((s) => (
            <li key={s.setNum}>
              <Link
                href={`/sets/${encodeURIComponent(s.setNum)}`}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono no-underline hover:border-[var(--accent)]"
              >
                {s.setNum}
              </Link>
            </li>
          ))}
        </ul>
        {setRows.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            在库存数据中未找到该零件。
          </p>
        ) : null}
      </section>
    </div>
  );
}
