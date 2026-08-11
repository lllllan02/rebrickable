import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull, min, ne } from "drizzle-orm";

import { CopyableId } from "@/components/copyable-id";
import { OwnedElementQtyInput } from "@/app/parts/owned-element-qty-input";
import { PartFavoriteToggle } from "@/app/parts/part-favorite-toggle";
import { PartGroupAssign } from "@/app/parts/part-group-assign";
import { PurchaseColorQtyInput } from "@/app/parts/purchase/purchase-color-qty-input";
import { PurchaseListAddToggle } from "@/app/parts/purchase/purchase-list-add-toggle";
import { getCatalogDb } from "@/db/client";
import { elementDomId } from "@/lib/dom-anchors";
import { isPartFavorite } from "@/lib/load-favorite-parts";
import {
  loadOwnedQtyByColorForPart,
  loadOwnedQtyForPart,
} from "@/lib/load-owned-parts";
import {
  isPartInPurchaseList,
  loadPurchaseQtyByColorForPart,
} from "@/lib/load-purchase-list";
import { loadGroupIdsForPart } from "@/lib/part-groups";
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

  const [
    asParent,
    asChild,
    elemRows,
    setRows,
    heroThumbRow,
    colorThumbRows,
    ownedQty,
    ownedQtyByColor,
    favorite,
    inPurchaseList,
    purchaseQtyByColor,
    partGroupIds,
  ] = await Promise.all([
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
      loadOwnedQtyForPart(partNum),
      loadOwnedQtyByColorForPart(partNum),
      isPartFavorite(partNum),
      isPartInPurchaseList(partNum),
      loadPurchaseQtyByColorForPart(partNum),
      loadGroupIdsForPart(partNum),
    ]);

  const heroThumb = heroThumbRow[0]?.thumb ?? null;
  const thumbByColor = new Map<number, string>();
  for (const t of colorThumbRows) {
    if (t.thumb) thumbByColor.set(t.colorId, t.thumb);
  }

  let purchaseQtyTotal = 0;
  for (const q of purchaseQtyByColor.values()) purchaseQtyTotal += q;

  /** 同色多元素合并为一行；保留全部 elementId 供展示与锚点跳转 */
  type ColorGroup = {
    colorId: number;
    colorName: string;
    rgb: string;
    elementIds: string[];
    designIds: string[];
  };
  const colorGroups: ColorGroup[] = [];
  const colorGroupIndex = new Map<number, number>();
  for (const e of elemRows) {
    const idx = colorGroupIndex.get(e.colorId);
    if (idx == null) {
      colorGroupIndex.set(e.colorId, colorGroups.length);
      colorGroups.push({
        colorId: e.colorId,
        colorName: e.colorName,
        rgb: e.rgb,
        elementIds: [e.elementId],
        designIds: e.designId ? [e.designId] : [],
      });
      continue;
    }
    const g = colorGroups[idx]!;
    g.elementIds.push(e.elementId);
    if (e.designId && !g.designIds.includes(e.designId)) {
      g.designIds.push(e.designId);
    }
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
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
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <PurchaseListAddToggle
                    partNum={row.partNum}
                    initialInList={inPurchaseList}
                  />
                  <PartFavoriteToggle
                    partNum={row.partNum}
                    initialFavorite={favorite}
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
                  <PartGroupAssign
                    partNum={row.partNum}
                    initialGroupIds={partGroupIds}
                  />
                  {inPurchaseList ? (
                    <Link
                      href="/parts/purchase"
                      className="text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      查看购买清单
                    </Link>
                  ) : null}
                  {favorite ? (
                    <Link
                      href="/parts/favorites"
                      className="text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      查看收藏
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
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
              <div>
                <dt className="inline text-[var(--text)]">待购：</dt>
                <dd className="inline tabular-nums">
                  {purchaseQtyTotal.toLocaleString("zh-CN")} 粒
                  {inPurchaseList || purchaseQtyTotal > 0 ? (
                    <>
                      {" · "}
                      <Link
                        href="/parts/purchase"
                        className="text-[var(--accent)] underline underline-offset-2"
                      >
                        购买清单
                      </Link>
                    </>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="inline text-[var(--text)]">零件库：</dt>
                <dd className="inline tabular-nums">
                  {ownedQty.toLocaleString("zh-CN")} 粒
                  {ownedQty > 0 ? (
                    <>
                      {" · "}
                      <Link
                        href="/parts/owned"
                        className="text-[var(--accent)] underline underline-offset-2"
                      >
                        查看清单
                      </Link>
                    </>
                  ) : null}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="section-title">颜色</h2>
        <ul className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
          {colorGroups.map((g) => {
            const colorThumb = thumbByColor.get(g.colorId);
            const purchaseQty = purchaseQtyByColor.get(g.colorId) ?? 0;
            const ownedQtyForColor = ownedQtyByColor.get(g.colorId) ?? 0;
            return (
              <li
                key={g.colorId}
                className="result-card relative flex-col scroll-mt-24 text-sm"
              >
                {g.elementIds.map((id) => (
                  <span
                    key={id}
                    id={elementDomId(id)}
                    className="absolute top-0"
                    aria-hidden
                  />
                ))}
                <div className="flex w-full items-center gap-2.5">
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
                    style={{ background: `#${g.rgb}` }}
                    title={g.rgb}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{g.colorName}</div>
                    <div className="mt-0.5 font-mono text-xs text-[var(--muted)]">
                      color {g.colorId}
                      {g.designIds.length > 0
                        ? ` · design ${g.designIds.join(", ")}`
                        : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-row items-start justify-end gap-1">
                    <PurchaseColorQtyInput
                      partNum={partNum}
                      colorId={g.colorId}
                      initialQuantity={purchaseQty}
                    />
                    <div className="inline-flex flex-col items-center gap-0.5">
                      <span
                        className="text-[9px] leading-none text-[var(--muted)]"
                        title="零件库"
                      >
                        库
                      </span>
                      <OwnedElementQtyInput
                        partNum={partNum}
                        colorId={g.colorId}
                        initialQuantity={ownedQtyForColor}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 border-t border-[var(--border)]/60 pt-2 font-mono text-xs text-[var(--muted)]">
                  <span className="shrink-0 text-[var(--muted-2)]">元素</span>
                  {g.elementIds.map((id, i) => (
                    <span key={id} className="inline-flex min-w-0 items-baseline">
                      {i > 0 ? (
                        <span className="mr-1.5 text-[var(--muted-2)]" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      <CopyableId
                        value={id}
                        kind="element_id"
                        className="shrink-0 whitespace-nowrap text-[var(--text)]"
                      >
                        {id}
                      </CopyableId>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        {colorGroups.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">暂无颜色记录。</p>
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
