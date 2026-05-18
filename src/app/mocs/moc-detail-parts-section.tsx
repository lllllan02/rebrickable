"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { fulfillmentItemsForDisplay } from "@/lib/sheet-row-replaced-marker";
import {
  fetchIoBatchFulfillmentSheetAction,
  fetchIoBatchShortageSheetAction,
  type IoSplitPlanGroup,
} from "@/app/mocs/io-batch-parts-sheet-actions";
import { invalidateIoSplitSheetCacheForBatch } from "@/lib/io-split-sheet-cache";
import { MocDetailPartsListExportBar } from "@/app/mocs/moc-detail-parts-export";
import { MocPartsSheetBrowser } from "@/app/mocs/moc-parts-sheet-browser";
import { PartsSheetImport } from "@/app/mocs/moc-parts-sheet-import";
import { MocPartsList } from "@/app/mocs/moc-parts-list";
import { buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";
import {
  hashFragmentToMocPartsListTab,
  MOC_PARTS_SCROLL_QUERY,
  MOC_PARTS_TAB_HASH,
  mocPartsTabElementId,
  parseMocPartsScrollQuery,
  type MocPartsListTab,
} from "@/lib/moc-parts-tab-navigation";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type ListTab = MocPartsListTab;

const MOC_PARTS_TAB_STORAGE_PREFIX = "rb:mocPartsTab:v1:";

function mocTabHasData(
  tab: ListTab,
  ctx: {
    initialFull: InitialMocSheetFromServer | null;
    initialFulfillment: InitialMocSheetFromServer | null;
    initialShortage: InitialMocSheetFromServer | null;
    hasOfficial: boolean;
  },
): boolean {
  switch (tab) {
    case "full":
      return Boolean(ctx.initialFull);
    case "fulfillment":
      return Boolean(ctx.initialFulfillment);
    case "shortage":
      return Boolean(ctx.initialShortage);
    case "official":
      return ctx.hasOfficial;
    default:
      return false;
  }
}

function readStoredMocListTab(subjectId: string): ListTab | null {
  try {
    const raw = sessionStorage.getItem(`${MOC_PARTS_TAB_STORAGE_PREFIX}${subjectId}`);
    if (raw === "full" || raw === "fulfillment" || raw === "shortage" || raw === "official") return raw;
  } catch {
    /* 隐私模式等 */
  }
  return null;
}

function writeStoredMocListTab(subjectId: string, tab: ListTab) {
  try {
    sessionStorage.setItem(`${MOC_PARTS_TAB_STORAGE_PREFIX}${subjectId}`, tab);
  } catch {
    /* ignore */
  }
}

function replaceUrlHashForMocTab(tab: ListTab) {
  if (typeof window === "undefined") return;
  const next = `#${MOC_PARTS_TAB_HASH[tab]}`;
  if (window.location.hash === next) return;
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
}

function scheduleScrollToElementById(elementId: string) {
  if (typeof document === "undefined" || !elementId) return;
  const run = () => {
    document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  });
}

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  initialFull: InitialMocSheetFromServer | null;
  initialShortage: InitialMocSheetFromServer | null;
  initialFulfillment: InitialMocSheetFromServer | null;
  initialMocLoadError: string | null;
  initialShortageClearedAt?: string | null;
  officialInventory?: {
    items: ShortageResolveItem[];
    inventoryId: number;
    version: number;
  } | null;
  parentSubjectOwned?: boolean;
  exportDisplayName: string;
  ioBatchId?: number;
  ioSplitPlans?: IoSplitPlanGroup[];
};

type IoBatchListTab = "full" | "fulfillment" | "shortage";

/** 单包详情页：横向 Tab（完整 / 配货 / 缺件） */
function IoBatchEmbeddedList({
  subjectKind,
  subjectId,
  ioBatchId,
  exportDisplayName,
  parentSubjectOwned,
  initialFull,
  initialShortage,
  initialFulfillment,
}: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  ioBatchId: number;
  exportDisplayName: string;
  parentSubjectOwned: boolean;
  initialFull: InitialMocSheetFromServer | null;
  initialShortage: InitialMocSheetFromServer | null;
  initialFulfillment: InitialMocSheetFromServer | null;
}) {
  const [listTab, setListTab] = useState<IoBatchListTab>(() => {
    if (initialFull) return "full";
    if (initialFulfillment) return "fulfillment";
    if (initialShortage) return "shortage";
    return "full";
  });

  const toDisplayFulfillment = useCallback((sheet: InitialMocSheetFromServer | null) => {
    if (!sheet) return null;
    const items = fulfillmentItemsForDisplay(sheet.items);
    if (!items.length) return null;
    return { ...sheet, items };
  }, []);

  const [fulfillmentSheet, setFulfillmentSheet] = useState(() =>
    toDisplayFulfillment(initialFulfillment),
  );
  const [shortageSheet, setShortageSheet] = useState(initialShortage);

  useEffect(() => {
    setFulfillmentSheet(toDisplayFulfillment(initialFulfillment));
  }, [initialFulfillment, toDisplayFulfillment]);

  useEffect(() => {
    setShortageSheet(initialShortage);
  }, [initialShortage]);

  const reloadFulfillmentSheet = useCallback(async () => {
    invalidateIoSplitSheetCacheForBatch(ioBatchId);
    const r = await fetchIoBatchFulfillmentSheetAction(ioBatchId);
    if (!r.ok) return;
    setFulfillmentSheet({
      subjectId,
      skippedHeader: r.skippedHeader,
      items: r.items,
      savedAt: r.savedAt ?? new Date().toISOString(),
    });
  }, [ioBatchId, subjectId]);

  const reloadShortageSheet = useCallback(async () => {
    invalidateIoSplitSheetCacheForBatch(ioBatchId);
    const r = await fetchIoBatchShortageSheetAction(ioBatchId);
    if (!r.ok) return;
    setShortageSheet({
      subjectId,
      skippedHeader: r.skippedHeader,
      items: r.items,
      savedAt: r.savedAt ?? new Date().toISOString(),
    });
  }, [ioBatchId, subjectId]);

  return (
    <div className="border-t border-[var(--border-soft)] pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!initialFull}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              listTab === "full"
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                : "border-[var(--border-soft)] text-[var(--muted)]"
            } ${!initialFull ? "cursor-not-allowed opacity-45" : ""}`}
            onClick={() => initialFull && setListTab("full")}
          >
            完整零件表
          </button>
          <button
            type="button"
            disabled={!fulfillmentSheet}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              listTab === "fulfillment"
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                : "border-[var(--border-soft)] text-[var(--muted)]"
            } ${!fulfillmentSheet ? "cursor-not-allowed opacity-45" : ""}`}
            onClick={() => fulfillmentSheet && setListTab("fulfillment")}
          >
            配货表
          </button>
          <button
            type="button"
            disabled={!initialShortage}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              listTab === "shortage"
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                : "border-[var(--border-soft)] text-[var(--muted)]"
            } ${!initialShortage ? "cursor-not-allowed opacity-45" : ""}`}
            onClick={() => initialShortage && setListTab("shortage")}
          >
            缺件表
          </button>
        </div>
        {(listTab === "full" || listTab === "shortage" || listTab === "fulfillment") &&
        subjectKind === BUILD_SUBJECT_MOC ? (
          <MocDetailPartsListExportBar
            subjectKind={subjectKind}
            subjectId={subjectId}
            exportDisplayName={exportDisplayName}
            listTab={listTab}
            initialFull={initialFull}
            initialShortage={initialShortage}
            initialFulfillment={fulfillmentSheet ?? initialFulfillment}
          />
        ) : null}
      </div>
      {listTab === "full" && initialFull ? (
        <MocPartsList
          items={initialFull.items}
          skippedHeader={initialFull.skippedHeader}
          savedAt={initialFull.savedAt}
          parentSubjectOwned={parentSubjectOwned}
        />
      ) : null}
      {listTab === "fulfillment" && !fulfillmentSheet && initialFulfillment ? (
        <p className="text-sm text-[var(--muted)]">该包尚无配货零件行。</p>
      ) : null}
      {listTab === "fulfillment" && fulfillmentSheet ? (
        <MocPartsList
          items={fulfillmentSheet.items}
          skippedHeader={fulfillmentSheet.skippedHeader}
          savedAt={fulfillmentSheet.savedAt}
          parentSubjectOwned={parentSubjectOwned}
          detailSubstituteSuggestions
          sheetRowReplaceContext={{
            subjectKind,
            subjectId,
            branch: "fulfillment",
            ioBatchId,
          }}
          onSheetRowMutated={reloadFulfillmentSheet}
        />
      ) : null}
      {listTab === "shortage" && shortageSheet ? (
        <MocPartsList
          items={shortageSheet.items}
          skippedHeader={shortageSheet.skippedHeader}
          savedAt={shortageSheet.savedAt}
          parentSubjectOwned={parentSubjectOwned}
          shortageListMode
          detailSubstituteSuggestions
          sheetRowReplaceContext={{
            subjectKind,
            subjectId,
            branch: "shortage",
            ioBatchId,
          }}
          onSheetRowMutated={async () => {
            await reloadShortageSheet();
            await reloadFulfillmentSheet();
          }}
          onShortageRowReplacedToFulfillment={() => setListTab("fulfillment")}
        />
      ) : null}
    </div>
  );
}

export function MocDetailPartsSection({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  initialFull,
  initialShortage,
  initialFulfillment,
  initialMocLoadError,
  initialShortageClearedAt = null,
  officialInventory = null,
  parentSubjectOwned = false,
  exportDisplayName,
  ioBatchId,
  ioSplitPlans = [],
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ui = buildSubjectUi(subjectKind);
  const listHref = buildSubjectListPath(subjectKind);
  const isSetSubject = subjectKind === BUILD_SUBJECT_SET;
  const hasOfficial = Boolean(officialInventory && officialInventory.items.length > 0);

  const [listTab, setListTab] = useState<ListTab>(() => {
    if (isSetSubject) return "official";
    if (initialFull) return "full";
    if (initialFulfillment) return "fulfillment";
    if (initialShortage) return "shortage";
    if (hasOfficial) return "official";
    return "full";
  });

  const mocTabDataCtx = useMemo(
    () => ({
      initialFull,
      initialFulfillment,
      initialShortage,
      hasOfficial,
    }),
    [initialFull, initialFulfillment, initialShortage, hasOfficial],
  );

  const useSheetBrowser = !ioBatchId;

  useEffect(() => {
    if (!useSheetBrowser || isSetSubject) return;
    if (listTab === "full" && !initialFull) {
      if (initialFulfillment) setListTab("fulfillment");
      else if (initialShortage) setListTab("shortage");
      else if (hasOfficial) setListTab("official");
    } else if (listTab === "fulfillment" && !initialFulfillment) {
      if (initialFull) setListTab("full");
      else if (initialShortage) setListTab("shortage");
      else if (hasOfficial) setListTab("official");
    } else if (listTab === "shortage" && !initialShortage) {
      if (initialFull) setListTab("full");
      else if (initialFulfillment) setListTab("fulfillment");
      else if (hasOfficial) setListTab("official");
    } else if (listTab === "official" && !hasOfficial) {
      if (initialFull) setListTab("full");
      else if (initialFulfillment) setListTab("fulfillment");
      else if (initialShortage) setListTab("shortage");
    }
  }, [hasOfficial, initialFull, initialFulfillment, initialShortage, isSetSubject, listTab, useSheetBrowser]);

  useLayoutEffect(() => {
    if (!useSheetBrowser || isSetSubject || typeof window === "undefined") return;
    const scrollFromList = parseMocPartsScrollQuery(searchParams.get(MOC_PARTS_SCROLL_QUERY));
    const scrollFromListOk =
      scrollFromList && mocTabHasData(scrollFromList, mocTabDataCtx) ? scrollFromList : null;
    const id = window.location.hash.replace(/^#/, "");
    const fromHash = id ? hashFragmentToMocPartsListTab(id) : null;
    const fromHashOk = fromHash && mocTabHasData(fromHash, mocTabDataCtx) ? fromHash : null;
    const fromStore = readStoredMocListTab(subjectId);
    const fromStoreOk = fromStore && mocTabHasData(fromStore, mocTabDataCtx) ? fromStore : null;
    const chosen = scrollFromListOk ?? fromHashOk ?? fromStoreOk;
    if (!chosen) return;
    setListTab(chosen);
    writeStoredMocListTab(subjectId, chosen);
    if (scrollFromListOk) {
      scheduleScrollToElementById(mocPartsTabElementId(scrollFromListOk));
      if (searchParams.has(MOC_PARTS_SCROLL_QUERY)) {
        const next = new URLSearchParams(searchParams.toString());
        next.delete(MOC_PARTS_SCROLL_QUERY);
        const qs = next.toString();
        const hash = window.location.hash;
        router.replace(`${pathname}${qs ? `?${qs}` : ""}${hash}`, { scroll: false });
      }
    }
  }, [isSetSubject, pathname, router, searchParams, subjectId, mocTabDataCtx, useSheetBrowser]);

  useEffect(() => {
    if (!useSheetBrowser || isSetSubject) return;
    const onHashChange = () => {
      const id = window.location.hash.replace(/^#/, "");
      const fromHash = id ? hashFragmentToMocPartsListTab(id) : null;
      if (!fromHash || !mocTabHasData(fromHash, mocTabDataCtx)) return;
      setListTab(fromHash);
      writeStoredMocListTab(subjectId, fromHash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [isSetSubject, subjectId, mocTabDataCtx, useSheetBrowser]);

  const selectMocListTab = useCallback(
    (tab: ListTab) => {
      setListTab(tab);
      writeStoredMocListTab(subjectId, tab);
      replaceUrlHashForMocTab(tab);
    },
    [subjectId],
  );

  const hasAnySheet = Boolean(initialFull || initialShortage || initialFulfillment);
  const hasIoPlans = !isSetSubject && ioSplitPlans.length > 0;
  const hasListArea = isSetSubject
    ? officialInventory != null || Boolean(initialShortage) || Boolean(initialFulfillment)
    : hasAnySheet || hasOfficial || hasIoPlans;

  return (
    <div id="moc-parts-sheet-tools" className="scroll-mt-24 border-t border-[var(--border-soft)] pt-8">
      <div className="section-panel space-y-5">
        <header className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--text)]">零件表</h2>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            {isSetSubject ? (
              <>左侧选「全部」；右侧切换完整 / 配货 / 缺件表。</>
            ) : (
              <>
                左侧选「全部」或分包方案；「全部」下为完整 / 配货 / 缺件表，分包方案下切换各分包与汇总缺件表。亦可从{" "}
                <Link href={listHref} className="text-[var(--accent)] underline">
                  {ui.noun} 列表
                </Link>{" "}
                上传 CSV。
              </>
            )}
          </p>
        </header>

        <PartsSheetImport
          buildSubjectKind={subjectKind}
          requestedLoadMocId={subjectId}
          ioBatchId={ioBatchId}
          initialFullSheet={isSetSubject ? null : initialFull}
          initialShortageSheet={initialShortage}
          initialFulfillmentSheet={initialFulfillment}
          initialShortageClearedAt={initialShortageClearedAt}
          initialMocLoadError={initialMocLoadError}
          exportDisplayName={exportDisplayName}
          mocDetailEmbed
        />

        {ioBatchId ? (
          <IoBatchEmbeddedList
            subjectKind={subjectKind}
            subjectId={subjectId}
            ioBatchId={ioBatchId}
            exportDisplayName={exportDisplayName}
            parentSubjectOwned={parentSubjectOwned}
            initialFull={initialFull}
            initialShortage={initialShortage}
            initialFulfillment={initialFulfillment}
          />
        ) : hasListArea ? (
          <div className="border-t border-[var(--border-soft)] pt-5">
            <MocPartsSheetBrowser
              subjectKind={subjectKind}
              subjectId={subjectId}
              exportDisplayName={exportDisplayName}
              parentSubjectOwned={parentSubjectOwned}
              initialFull={isSetSubject ? null : initialFull}
              initialShortage={initialShortage}
              initialFulfillment={initialFulfillment}
              officialInventory={officialInventory}
              ioSplitPlans={isSetSubject ? [] : ioSplitPlans}
              allTab={listTab}
              onAllTabChange={selectMocListTab}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}