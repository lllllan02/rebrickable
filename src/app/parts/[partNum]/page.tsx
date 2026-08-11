import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, isNotNull, min, ne } from "drizzle-orm";

import { CopyableId } from "@/components/copyable-id";
import { OwnedElementQtyInput } from "@/app/parts/owned-element-qty-input";
import { PartFavoriteToggle } from "@/app/parts/part-favorite-toggle";
import { PartGroupAssign } from "@/app/parts/part-group-assign";
import {
  PartRelatedTiles,
  type PartRelatedTile,
} from "@/app/parts/part-related-tiles";
import { PurchaseColorQtyInput } from "@/app/parts/purchase/purchase-color-qty-input";
import { PurchaseListAddToggle } from "@/app/parts/purchase/purchase-list-add-toggle";
import { getCatalogDb } from "@/db/client";
import { formatCatalogBilingualColorLabel } from "@/lib/color-zh-names";
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
import { loadGroupsForPart } from "@/lib/part-groups";
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

async function loadRelatedPartMeta(
  partNums: string[]
): Promise<Map<string, { name: string; thumbUrl: string | null }>> {
  const unique = [...new Set(partNums.filter(Boolean))];
  const map = new Map<string, { name: string; thumbUrl: string | null }>();
  if (unique.length === 0) return map;

  const catalogDb = getCatalogDb();
  const [nameRows, thumbRows] = await Promise.all([
    catalogDb
      .select({ partNum: parts.partNum, name: parts.name })
      .from(parts)
      .where(inArray(parts.partNum, unique)),
    catalogDb
      .select({
        partNum: inventoryParts.partNum,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, unique),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum),
  ]);

  const thumbBy = new Map<string, string>();
  for (const t of thumbRows) {
    if (t.thumb) thumbBy.set(t.partNum, t.thumb);
  }
  for (const n of nameRows) {
    map.set(n.partNum, {
      name: n.name,
      thumbUrl: thumbBy.get(n.partNum) ?? null,
    });
  }
  return map;
}

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
    asParentRels,
    asChildRels,
    elemRows,
    setRows,
    heroThumbRow,
    colorThumbRows,
    ownedQty,
    ownedQtyByColor,
    favorite,
    inPurchaseList,
    purchaseQtyByColor,
    partGroups,
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
      .innerJoin(inventories, eq(inventoryParts.inventoryId, inventories.id))
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
    loadGroupsForPart(partNum),
  ]);

  const relatedMeta = await loadRelatedPartMeta([
    ...asParentRels.map((r) => r.child),
    ...asChildRels.map((r) => r.parent),
  ]);

  const childTiles: PartRelatedTile[] = asParentRels.map((r) => {
    const meta = relatedMeta.get(r.child);
    return {
      partNum: r.child,
      name: meta?.name ?? r.child,
      relType: r.relType,
      thumbUrl: meta?.thumbUrl ?? null,
    };
  });
  const parentTiles: PartRelatedTile[] = asChildRels.map((r) => {
    const meta = relatedMeta.get(r.parent);
    return {
      partNum: r.parent,
      name: meta?.name ?? r.parent,
      relType: r.relType,
      thumbUrl: meta?.thumbUrl ?? null,
    };
  });

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
      <section className="hero-panel !px-3 !py-3 sm:!px-4 sm:!py-3.5">
        <Link href="/parts" className="back-link">
          ← 零件列表
        </Link>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="media-box mx-auto h-[4.75rem] w-[4.75rem] shrink-0 sm:mx-0">
            {heroThumb ? (
              <Image
                src={heroThumb}
                alt={`${row.partNum} 零件图`}
                width={76}
                height={76}
                className="box-border h-full w-full object-contain p-1"
                sizes="76px"
                priority
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
              <h1 className="min-w-0">
                <CopyableId
                  value={row.partNum}
                  kind="零件号"
                  className="font-mono text-xl font-extrabold tracking-tight text-[var(--accent)] sm:text-2xl"
                >
                  {row.partNum}
                </CopyableId>
              </h1>
              <p className="inline-flex min-w-0 max-w-full items-baseline gap-1.5 text-sm text-[var(--muted)] sm:text-base">
                <span className="min-w-0">{row.name}</span>
                <a
                  href={`https://rebrickable.com/parts/${encodeURIComponent(row.partNum)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-5 shrink-0 items-center rounded border border-[var(--border)] px-1 text-[10px] font-semibold leading-none text-[var(--accent)] no-underline hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                  title="在 Rebrickable 打开"
                  aria-label="在 Rebrickable 打开"
                >
                  RB
                </a>
              </p>
            </div>
            <dl className="meta-row mt-1.5 text-sm">
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
            <PartGroupAssign
              partNum={row.partNum}
              initialGroups={partGroups}
              className="mt-1.5"
            />
          </div>

          <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
              <Link
                href="/parts/purchase"
                className={`inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 no-underline transition-colors ${
                  purchaseQtyTotal > 0
                    ? "border-amber-400/50 bg-amber-400/12 text-[var(--text)] hover:border-amber-400/70"
                    : "border-[var(--border-soft)] bg-[rgba(255,255,255,0.03)] text-[var(--muted)] hover:border-[var(--border)]"
                }`}
                title="查看购买清单"
              >
                <span className="text-[11px] font-semibold leading-none">
                  待购
                </span>
                <span
                  className={`text-xl font-extrabold tabular-nums leading-none tracking-tight ${
                    purchaseQtyTotal > 0
                      ? "text-amber-200"
                      : "text-[var(--text)]"
                  }`}
                >
                  {purchaseQtyTotal.toLocaleString("zh-CN")}
                </span>
                <span className="text-[11px] leading-none">粒</span>
              </Link>
              <Link
                href="/parts/owned"
                className={`inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 no-underline transition-colors ${
                  ownedQty > 0
                    ? "border-[var(--accent)]/45 bg-[var(--accent)]/10 text-[var(--text)] hover:border-[var(--accent)]/65"
                    : "border-[var(--border-soft)] bg-[rgba(255,255,255,0.03)] text-[var(--muted)] hover:border-[var(--border)]"
                }`}
                title="查看零件库"
              >
                <span className="text-[11px] font-semibold leading-none">
                  零件库
                </span>
                <span
                  className={`text-xl font-extrabold tabular-nums leading-none tracking-tight ${
                    ownedQty > 0
                      ? "text-[var(--accent)]"
                      : "text-[var(--text)]"
                  }`}
                >
                  {ownedQty.toLocaleString("zh-CN")}
                </span>
                <span className="text-[11px] leading-none">粒</span>
              </Link>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-end">
              <PurchaseListAddToggle
                partNum={row.partNum}
                initialInList={inPurchaseList}
              />
              <PartFavoriteToggle
                partNum={row.partNum}
                initialFavorite={favorite}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="section-panel">
          <h2 className="section-title">子零件（本件为父）</h2>
          <div className="mt-2">
            <PartRelatedTiles items={childTiles} />
          </div>
        </div>
        <div className="section-panel">
          <h2 className="section-title">父零件（本件为子）</h2>
          <div className="mt-2">
            <PartRelatedTiles items={parentTiles} />
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
                    <div className="font-medium">
                      {formatCatalogBilingualColorLabel(g.colorId, g.colorName)}
                    </div>
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
