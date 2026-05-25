import Link from "next/link";
import { inArray } from "drizzle-orm";

import { GoodPricesListClient } from "@/app/sets/good-prices-list-client";
import { getCatalogDb, getUserDb } from "@/db/client";
import { buildSetGoodPrices, legoSets } from "@/db/schema";
import { hasAnySetGoodPrice } from "@/lib/set-good-price-channel";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";
import { batchSetStudVolumeStats } from "@/lib/set-catalog-stud-volume";
import {
  parseSetGoodPriceListSort,
  sortSetGoodPriceListItems,
  type SetGoodPriceListItem,
} from "@/lib/set-good-price-list-sort";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    kind?: string;
    metric?: string;
    dir?: string;
    sort?: string;
  }>;
};

export default async function SetGoodPricesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sortState = parseSetGoodPriceListSort(sp);

  const userDb = getUserDb();
  const allPriceRows = await userDb.select().from(buildSetGoodPrices);
  const priceRows = allPriceRows.filter((r) =>
    hasAnySetGoodPrice(r.priceNewCny, r.priceUsedCny)
  );

  const setNums = priceRows.map((r) => r.setNum);
  const catalogDb = getCatalogDb();

  const catalogRows =
    setNums.length > 0
      ? await catalogDb
          .select({
            setNum: legoSets.setNum,
            name: legoSets.name,
            year: legoSets.year,
            numParts: legoSets.numParts,
          })
          .from(legoSets)
          .where(inArray(legoSets.setNum, setNums))
      : [];

  const heroUrls = setNums.length > 0 ? await batchSetCatalogHeroUrls(setNums) : new Map();
  const studStats =
    setNums.length > 0 ? await batchSetStudVolumeStats(setNums) : new Map();

  const catalogBySet = new Map(catalogRows.map((c) => [c.setNum, c]));

  const merged: SetGoodPriceListItem[] = priceRows.map((r) => {
    const cat = catalogBySet.get(r.setNum);
    const vol = studStats.get(r.setNum);
    const hasBom = vol != null && vol.totalPieceQty > 0;
    return {
      setNum: r.setNum,
      priceNewCny: r.priceNewCny,
      priceUsedCny: r.priceUsedCny,
      updatedAt: r.updatedAt,
      catalogName: cat?.name ?? null,
      year: cat?.year ?? null,
      numParts: cat?.numParts ?? null,
      totalStudUnits: hasBom && vol.totalStudUnits > 0 ? vol.totalStudUnits : null,
      studCoverageRatio: hasBom ? vol.coverageRatio : null,
      gobricksPriceCny: r.gobricksPriceCny ?? null,
      gobricksMatchPercent: r.gobricksMatchPercent ?? null,
      gobricksComparedAt: r.gobricksComparedAt ?? null,
    };
  });

  const items = sortSetGoodPriceListItems(merged, sortState).map((item) => ({
    ...item,
    title: item.catalogName?.trim() || item.setNum,
    coverUrl: heroUrls.get(item.setNum) ?? null,
  }));

  return (
    <div className="page-stack">
      <header className="flex flex-col gap-2">
        <p className="page-kicker">官方套装</p>
        <h1 className="page-title">好价榜</h1>
        <p className="max-w-xl text-sm text-[var(--muted)]">
          {items.length > 0 ? (
            <>
              共 <span className="tabular-nums text-[var(--text)]">{items.length}</span>{" "}
              套已记录入手价；成色下拉选择，总价/单价/占地单价重复点击切换升序与降序。占地单价按官方
              BOM 长×宽汇总（不含高度；无法解析尺寸的主件按 1 单位/颗），并显示可统计零件占比。默认：全新总价升序。
            </>
          ) : (
            <>在此添加、编辑或删除各套装的入手好价；操作按钮在列表右上方。</>
          )}
        </p>
      </header>

      <div className="table-shell p-2 sm:p-3">
        <GoodPricesListClient items={items} sortState={sortState} />
      </div>

      <p className="text-center text-sm text-[var(--muted)]">
        <Link href="/sets" className="text-[var(--accent)] underline-offset-2 hover:underline">
          浏览全部套装
        </Link>
      </p>
    </div>
  );
}
