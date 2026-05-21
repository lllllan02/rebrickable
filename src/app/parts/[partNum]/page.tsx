import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull, min, ne } from "drizzle-orm";

import { CopyableId } from "@/components/copyable-id";
import { getCatalogDb } from "@/db/client";
import { elementDomId } from "@/lib/dom-anchors";
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

  const catalogDb = getCatalogDb();
  const [row] = await catalogDb
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
      catalogDb
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
      catalogDb
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
      catalogDb
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
      catalogDb
        .selectDistinct({ setNum: inventories.setNum })
        .from(inventoryParts)
        .innerJoin(
          inventories,
          eq(inventoryParts.inventoryId, inventories.id)
        )
        .where(eq(inventoryParts.partNum, partNum))
        .orderBy(asc(inventories.setNum))
        .limit(80),
      catalogDb
        .select({ thumb: min(inventoryParts.imgUrl) })
        .from(inventoryParts)
        .where(imgClause),
      catalogDb
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
    <div className="page-stack">
      <section className="hero-panel">
        <Link href="/parts" className="back-link">
          ← 零件列表
        </Link>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="media-box media-box-lg mx-auto shrink-0 sm:mx-0 sm:w-56">
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
            <p className="page-kicker">Part detail</p>
            <h1 className="mt-1">
              <CopyableId
                value={row.partNum}
                kind="零件号"
                className="font-mono text-3xl font-extrabold tracking-tight text-[var(--accent)]"
              >
                {row.partNum}
              </CopyableId>
            </h1>
            <p className="mt-1 text-lg">{row.name}</p>
            <dl className="meta-row mt-4 text-sm">
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
      </section>

      <section className="space-y-2">
        <h2 className="section-title">颜色 / 元素</h2>
        <ul className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          {elemRows.map((e) => {
            const colorThumb = thumbByColor.get(e.colorId);
            return (
              <li
                key={e.elementId}
                id={elementDomId(e.elementId)}
                className="result-card items-center scroll-mt-24 text-sm"
              >
                <div className="media-box media-box-sm">
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
                  className="color-swatch h-8 w-8 shrink-0"
                  style={{ background: `#${e.rgb}` }}
                  title={e.rgb}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{e.colorName}</div>
                  <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1 font-mono text-xs text-[var(--muted)]">
                    <CopyableId
                      value={e.elementId}
                      kind="element_id"
                      className="shrink-0 whitespace-nowrap text-[var(--text)]"
                    >
                      {e.elementId}
                    </CopyableId>
                    <span className="min-w-0">
                      {" · "}color {e.colorId}
                      {e.designId ? ` · design ${e.designId}` : ""}
                    </span>
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
        <div className="section-panel">
          <h2 className="section-title">子零件（本件为父）</h2>
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
        <div className="section-panel">
          <h2 className="section-title">父零件（本件为子）</h2>
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

      <section className="section-panel">
        <h2 className="section-title">出现的套装（抽样）</h2>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {setRows.map((s) => (
            <li key={s.setNum}>
              <Link
                href={`/sets/${encodeURIComponent(s.setNum)}`}
                className="badge font-mono no-underline hover:border-[var(--accent)] hover:text-[var(--accent)]"
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
