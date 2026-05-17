"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { MocDetailPartsListExportBar } from "@/app/mocs/moc-detail-parts-export";
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

/** 列表带 `partsScroll` 进入时滚到对应 Tab（等 Tab 提交后再滚，动态 id 才存在） */
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
  /** 服务端「标记为不缺」写入的 ISO 时间；无则 null */
  initialShortageClearedAt?: string | null;
  /** 套装：官方 `inventory_parts` 列表（已转为与缺货表相同的行结构） */
  officialInventory?: {
    items: ShortageResolveItem[];
    inventoryId: number;
    version: number;
  } | null;
  /** 当前 MOC/套装主体已在「我的拥有」中标记 */
  parentSubjectOwned?: boolean;
  /** 导出文件名用显示名（套装无自定义名时传目录名） */
  exportDisplayName: string;
};

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
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ui = buildSubjectUi(subjectKind);
  const listHref = buildSubjectListPath(subjectKind);
  const isSetSubject = subjectKind === BUILD_SUBJECT_SET;
  const hasOfficialRows = Boolean(officialInventory && officialInventory.items.length > 0);
  const hasOfficial = hasOfficialRows;

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

  useEffect(() => {
    if (isSetSubject) {
      if (listTab === "full") setListTab("official");
      else if (listTab === "shortage" && !initialShortage) setListTab("official");
      else if (listTab === "fulfillment" && !initialFulfillment) setListTab("official");
      return;
    }
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
  }, [hasOfficial, initialFull, initialFulfillment, initialShortage, isSetSubject, listTab]);

  useLayoutEffect(() => {
    if (isSetSubject || typeof window === "undefined") return;
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
  }, [isSetSubject, pathname, router, searchParams, subjectId, mocTabDataCtx]);

  useEffect(() => {
    if (isSetSubject) return;
    const onHashChange = () => {
      const id = window.location.hash.replace(/^#/, "");
      const fromHash = id ? hashFragmentToMocPartsListTab(id) : null;
      if (!fromHash || !mocTabHasData(fromHash, mocTabDataCtx)) return;
      setListTab(fromHash);
      writeStoredMocListTab(subjectId, fromHash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [isSetSubject, subjectId, mocTabDataCtx]);

  useEffect(() => {
    if (isSetSubject) return;
    if (!mocTabHasData(listTab, mocTabDataCtx)) return;
    writeStoredMocListTab(subjectId, listTab);
  }, [isSetSubject, subjectId, listTab, mocTabDataCtx]);

  const selectMocListTab = useCallback((tab: ListTab) => {
    setListTab(tab);
    replaceUrlHashForMocTab(tab);
  }, []);
  const hasAnySheet = Boolean(initialFull || initialShortage || initialFulfillment);
  const hasListArea = isSetSubject
    ? officialInventory != null || Boolean(initialShortage) || Boolean(initialFulfillment)
    : hasAnySheet || hasOfficial;

  const officialMetaLine =
    officialInventory != null
      ? `Rebrickable 本地库存 · inventory_id ${officialInventory.inventoryId} · 版本 v${officialInventory.version}`
      : "";

  return (
    <div id="moc-parts-sheet-tools" className="scroll-mt-24 border-t border-[var(--border-soft)] pt-8">
      <div className="section-panel space-y-5">
        <header className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--text)]">零件表</h2>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            {isSetSubject ? (
              <>
                「完整零件表」为本地已导入的 Rebrickable 官方库存（
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                  inventory_parts
                </code>
                ）。「配货表」「缺件表」由上方「从高砖同步」对照官方清单写入（分别对应高砖接口的{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[12px]">
                  itemList
                </code>{" "}
                与缺件相关列表）。已保存数据会出现在{" "}
                <Link href={listHref} className="text-[var(--accent)] underline">
                  套装列表
                </Link>{" "}
                的「已存零件表」区域。
              </>
            ) : (
              <>
                与{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                  rebrickable_parts_*_缺货表.csv
                </code>{" "}
                相同结构，亦支持 BrickLink Studio 2.0 零件清单 CSV（颜色按{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[12px]">LDrawColorId</code>{" "}
                与目录、高砖对齐）。可先上传完整零件表，保存后将自动对照高砖写入配货表与缺件表；亦可在上方手动同步。解析成功后写入本 {ui.noun}（各表互不覆盖）。下方可切换查看。新记录也可从{" "}
                <Link href={listHref} className="text-[var(--accent)] underline">
                  {ui.noun} 列表
                </Link>{" "}
                顶部上传导入（默认写入完整表）。
                {hasOfficial ? (
                  <>
                    {" "}
                    「官方清单」与 CSV 使用同一套列表与筛选界面，数据来自本地已导入的{" "}
                    <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                      inventories
                    </code>
                    /
                    <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                      inventory_parts
                    </code>
                    ，与 CSV 写入的 SQLite 行并存、互不覆盖。
                  </>
                ) : null}
              </>
            )}
          </p>
        </header>

        <PartsSheetImport
          buildSubjectKind={subjectKind}
          requestedLoadMocId={subjectId}
          initialFullSheet={isSetSubject ? null : initialFull}
          initialShortageSheet={initialShortage}
          initialFulfillmentSheet={initialFulfillment}
          initialShortageClearedAt={initialShortageClearedAt}
          initialMocLoadError={initialMocLoadError}
          exportDisplayName={exportDisplayName}
          mocDetailEmbed
        />

        {hasListArea ? (
          <div
            id={!isSetSubject ? MOC_PARTS_TAB_HASH[listTab] : undefined}
            className="scroll-mt-24 border-t border-[var(--border-soft)] pt-5"
          >
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex flex-wrap gap-2">
                {isSetSubject ? (
                  <>
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        listTab === "official"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                      }`}
                      onClick={() => setListTab("official")}
                    >
                      完整零件表
                    </button>
                    <button
                      type="button"
                      disabled={!initialFulfillment}
                      title={!initialFulfillment ? "尚无配货表，请先用高砖同步" : undefined}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        listTab === "fulfillment"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                      } ${!initialFulfillment ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => {
                        if (initialFulfillment) setListTab("fulfillment");
                      }}
                    >
                      配货表
                    </button>
                    <button
                      type="button"
                      disabled={!initialShortage}
                      title={!initialShortage ? "尚无缺件表，请先用高砖同步" : undefined}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        listTab === "shortage"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                      } ${!initialShortage ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => {
                        if (initialShortage) setListTab("shortage");
                      }}
                    >
                      缺件表
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!initialFull}
                      title={!initialFull ? "尚未上传完整零件表" : undefined}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        listTab === "full"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                      } ${!initialFull ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => {
                        if (initialFull) selectMocListTab("full");
                      }}
                    >
                      完整零件表
                    </button>
                    <button
                      type="button"
                      disabled={!initialFulfillment}
                      title={!initialFulfillment ? "尚无配货表，请先用高砖同步" : undefined}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        listTab === "fulfillment"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                      } ${!initialFulfillment ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => {
                        if (initialFulfillment) selectMocListTab("fulfillment");
                      }}
                    >
                      配货表
                    </button>
                    <button
                      type="button"
                      disabled={!initialShortage}
                      title={!initialShortage ? "尚无缺件表，请先用高砖同步" : undefined}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        listTab === "shortage"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                      } ${!initialShortage ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => {
                        if (initialShortage) selectMocListTab("shortage");
                      }}
                    >
                      缺件表
                    </button>
                    {hasOfficial ? (
                      <button
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          listTab === "official"
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                            : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                        }`}
                        onClick={() => selectMocListTab("official")}
                      >
                        官方清单
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              {listTab === "full" || listTab === "shortage" || listTab === "fulfillment" ? (
                <MocDetailPartsListExportBar
                  subjectKind={subjectKind}
                  subjectId={subjectId}
                  exportDisplayName={exportDisplayName}
                  listTab={listTab}
                  initialFull={initialFull}
                  initialShortage={initialShortage}
                  initialFulfillment={initialFulfillment}
                />
              ) : null}
            </div>

            {listTab === "full" && initialFull ? (
              <MocPartsList
                items={initialFull.items}
                skippedHeader={initialFull.skippedHeader}
                savedAt={initialFull.savedAt}
                totalPartQty={undefined}
                parentSubjectOwned={parentSubjectOwned}
              />
            ) : null}
            {listTab === "fulfillment" && initialFulfillment ? (
              <MocPartsList
                items={initialFulfillment.items}
                skippedHeader={initialFulfillment.skippedHeader}
                savedAt={initialFulfillment.savedAt}
                totalPartQty={undefined}
                parentSubjectOwned={parentSubjectOwned}
                detailSubstituteSuggestions
                sheetRowReplaceContext={{
                  subjectKind,
                  subjectId,
                  branch: "fulfillment",
                }}
              />
            ) : null}
            {listTab === "shortage" && initialShortage ? (
              <MocPartsList
                items={initialShortage.items}
                skippedHeader={initialShortage.skippedHeader}
                savedAt={initialShortage.savedAt}
                totalPartQty={undefined}
                shortageListMode
                parentSubjectOwned={parentSubjectOwned}
                detailSubstituteSuggestions
                sheetRowReplaceContext={{
                  subjectKind,
                  subjectId,
                  branch: "shortage",
                }}
                onShortageRowReplacedToFulfillment={() => setListTab("fulfillment")}
              />
            ) : null}
            {listTab === "official" && officialInventory ? (
              hasOfficialRows ? (
                <MocPartsList
                  items={officialInventory.items}
                  skippedHeader={false}
                  savedAt="2000-01-01T00:00:00.000Z"
                  sourceMetaLine={officialMetaLine}
                  totalPartQty={undefined}
                  parentSubjectOwned={parentSubjectOwned}
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">本地库存中暂无该套装的零件行。</p>
              )
            ) : null}

            {listTab === "full" && !initialFull ? (
              <p className="text-sm text-[var(--muted)]">
                尚未上传完整零件表，请使用上方「上传完整零件表 CSV」。
              </p>
            ) : null}
            {listTab === "fulfillment" && !initialFulfillment ? (
              <p className="text-sm text-[var(--muted)]">
                尚无配货表，请使用上方「从高砖同步缺件与配货」。
              </p>
            ) : null}
            {listTab === "shortage" && !initialShortage ? (
              <p className="text-sm text-[var(--muted)]">
                尚无缺件表，请使用上方「从高砖同步缺件与配货」。
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
