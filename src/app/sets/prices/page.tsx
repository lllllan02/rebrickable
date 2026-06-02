import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";

import { BricktimeConfigPanel } from "@/app/sets/bricktime-config-panel";
import { GoodPricesListClient } from "@/app/sets/good-prices-list-client";
import { getCatalogDb, getUserDb } from "@/db/client";
import { buildOwnedSubjects, buildSetGoodPrices, legoSets } from "@/db/schema";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";
import {
  isSetWorkflowMarkFilter,
  parseSetListMarkFilter,
} from "@/lib/build-list-mark-filter";
import { normalizeWorkflowStageForKind } from "@/lib/build-workflow-stage";
import { loadBricktimeConfigPublic } from "@/lib/bricktime-config";
import { hasAnySetGoodPrice } from "@/lib/set-good-price-channel";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";
import {
  parseSetGoodPriceListSort,
  sortSetGoodPriceListItems,
  type SetGoodPriceListItem,
} from "@/lib/set-good-price-list-sort";
import {
  itemMatchesSetGoodPriceHeatFilter,
  parseSetGoodPriceHeatFilter,
} from "@/lib/set-good-price-heat";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    kind?: string;
    metric?: string;
    dir?: string;
    sort?: string;
    heat?: string;
    heatMin?: string;
    mark?: string;
  }>;
};

export default async function SetGoodPricesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sortState = parseSetGoodPriceListSort(sp);
  const heatFilter = parseSetGoodPriceHeatFilter(sp);
  const markFilter = parseSetListMarkFilter(sp.mark);
  const bricktimeConfig = await loadBricktimeConfigPublic();

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
  const workflowRows =
    setNums.length > 0
      ? await userDb
          .select({
            subjectId: buildOwnedSubjects.subjectId,
            workflowStage: buildOwnedSubjects.workflowStage,
          })
          .from(buildOwnedSubjects)
          .where(
            and(
              eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_SET),
              inArray(buildOwnedSubjects.subjectId, setNums)
            )
          )
      : [];

  const catalogBySet = new Map(catalogRows.map((c) => [c.setNum, c]));
  const workflowBySet = new Map(
    workflowRows.map((r) => [
      r.subjectId,
      normalizeWorkflowStageForKind(r.workflowStage, BUILD_SUBJECT_SET),
    ])
  );

  const merged: SetGoodPriceListItem[] = priceRows.map((r) => {
    const cat = catalogBySet.get(r.setNum);
    return {
      setNum: r.setNum,
      priceNewCny: r.priceNewCny,
      priceUsedCny: r.priceUsedCny,
      updatedAt: r.updatedAt,
      catalogName: cat?.name ?? null,
      year: cat?.year ?? null,
      numParts: cat?.numParts ?? null,
      gobricksPriceCny: r.gobricksPriceCny ?? null,
      gobricksMatchPercent: r.gobricksMatchPercent ?? null,
      gobricksComparedAt: r.gobricksComparedAt ?? null,
      bricktimeOfficialPrice: r.bricktimeOfficialPrice ?? null,
      bricktimeGoodPrice: r.bricktimeGoodPrice ?? null,
      bricktimeLowestPrice: r.bricktimeLowestPrice ?? null,
      bricktimeRecentLowPrice: r.bricktimeRecentLowPrice ?? null,
      bricktimeFetchedAt: r.bricktimeFetchedAt ?? null,
      bricktimeLaunchDate: r.bricktimeLaunchDate ?? null,
      bricktimeRetiredDate: r.bricktimeRetiredDate ?? null,
      bricktimeSalesStatus: r.bricktimeSalesStatus ?? null,
      bricktimeWeight: r.bricktimeWeight ?? null,
      bricktimeBuildingTime: r.bricktimeBuildingTime ?? null,
      bricktimePriceHistory: r.bricktimePriceHistory ?? null,
      workflowStage: workflowBySet.get(r.setNum) ?? null,
    };
  });

  const sorted = sortSetGoodPriceListItems(merged, sortState);
  const markFiltered = isSetWorkflowMarkFilter(markFilter)
    ? sorted.filter((item) =>
        markFilter === "complete"
          ? item.workflowStage === "complete" || item.workflowStage === "purchase"
          : item.workflowStage === markFilter
      )
    : sorted;
  const filtered =
    heatFilter.kind === "exact"
      ? markFiltered.filter((item) => itemMatchesSetGoodPriceHeatFilter(item, heatFilter))
      : markFiltered;
  const items = filtered.map((item) => ({
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
              套已记录入手价；成色、热度与心动可筛选，总价/单价/折扣力度重复点击切换升序与降序。默认：全新总价升序。
            </>
          ) : (
            <>在此添加、编辑或删除各套装的入手好价；操作按钮在列表右上方。</>
          )}
        </p>
      </header>

      <div className="table-shell p-2 sm:p-3">
        <BricktimeConfigPanel initialConfig={bricktimeConfig} />
        <GoodPricesListClient
          items={items}
          sortState={sortState}
          heatFilter={heatFilter}
          markFilter={markFilter}
        />
      </div>

      <p className="text-center text-sm text-[var(--muted)]">
        <Link href="/sets" className="text-[var(--accent)] underline-offset-2 hover:underline">
          浏览全部套装
        </Link>
      </p>
    </div>
  );
}
