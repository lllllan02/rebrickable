"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchIoBatchFulfillmentSheetAction,
  type IoBatchListRow,
  type IoSplitPlanGroup,
} from "@/app/mocs/io-batch-parts-sheet-actions";
import { ManualSplitBagViewer } from "@/app/mocs/manual-split-bag-viewer";
import { ManualSplitPlanDeleteButton } from "@/app/mocs/manual-split-plan-delete";
import { ManualSplitStartButton } from "@/app/mocs/manual-split-start-button";
import type { ManualSplitPlanGroup } from "@/app/mocs/manual-split-actions";
import { MocIoSplitPlanDeleteButton } from "@/app/mocs/moc-io-split-plan-delete";
import { MocIoSplitSheetViewer, type IoSplitSheetState } from "@/app/mocs/moc-io-split-sheet-viewer";
import { MocDetailPartsListExportBar } from "@/app/mocs/moc-detail-parts-export";
import { MocPartsList } from "@/app/mocs/moc-parts-list";
import type { InitialBuildSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { fulfillmentItemsForDisplay } from "@/lib/sheet-row-replaced-marker";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectManualSplitPath } from "@/lib/build-subject-paths";
import {
  MOC_PARTS_TAB_HASH,
  type MocPartsListTab,
} from "@/lib/moc-parts-tab-navigation";
import {
  buildIoPlanMergedShortageExportStem,
  buildIoSplitBatchExportStem,
} from "@/lib/parts-sheet-export-filename";
import { ioBatchSheetLoadKey, loadIoSplitSheet } from "@/lib/io-split-sheet-cache";
import { formatGobricksGdsPriceCny } from "@/lib/gobricks-display-caption";
import { ioSplitPackageLabel } from "@/lib/io-split-labels";

type ListTab = MocPartsListTab;
type PrimaryPanel =
  | { kind: "all" }
  | { kind: "io"; groupKey: string }
  | { kind: "manual"; planId: number };

type IoSecondary = { kind: "batch"; batchId: number } | { kind: "merged-shortage" };

type Props = {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  exportDisplayName: string;
  initialFull: InitialBuildSheetFromServer | null;
  initialShortage: InitialBuildSheetFromServer | null;
  initialFulfillment: InitialBuildSheetFromServer | null;
  officialInventory: {
    items: import("@/lib/shortage-resolve-types").ShortageResolveItem[];
    inventoryId: number;
    version: number;
  } | null;
  ioSplitPlans: IoSplitPlanGroup[];
  manualSplitPlans?: ManualSplitPlanGroup[];
  /** 是否可从完整零件表进入手动分包 */
  canManualSplit?: boolean;
  /** 与 URL hash 同步的「全部」二级 Tab（仅 MOC 详情页传入） */
  allTab?: ListTab;
  onAllTabChange?: (tab: ListTab) => void;
};

function planDisplayName(plan: IoSplitPlanGroup, index: number): string {
  return plan.ruleLabel.trim() || ioSplitPackageLabel(index + 1);
}

function batchTabLabel(batch: IoBatchListRow, index: number): string {
  return batch.label.trim() || ioSplitPackageLabel(index + 1);
}

function batchTabTitle(batch: IoBatchListRow, index: number): string {
  const parts = [batchTabLabel(batch, index), `${batch.totalPartQty} 片`];
  const price = formatGobricksGdsPriceCny(batch.gobricksGdsPriceCny);
  if (price) parts.push(`参考价 ${price}`);
  return parts.join(" · ");
}

const navBtn =
  "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors";
const navBtnActive =
  "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--text)]";
const navBtnIdle =
  "border-transparent text-[var(--muted)] hover:border-[var(--border-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";

const subTabBtn =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors";
const subTabActive = "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]";
const subTabIdle =
  "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]";

export function MocPartsSheetBrowser({
  subjectKind,
  subjectId,
  exportDisplayName,
  initialFull,
  initialShortage,
  initialFulfillment,
  officialInventory,
  ioSplitPlans,
  manualSplitPlans = [],
  canManualSplit = false,
  allTab: controlledAllTab,
  onAllTabChange,
}: Props) {
  const isSetSubject = subjectKind === BUILD_SUBJECT_SET;
  const hasOfficial = Boolean(officialInventory && officialInventory.items.length > 0);

  const [primary, setPrimary] = useState<PrimaryPanel>(() => {
    if (ioSplitPlans.length > 0 && !initialFull && !initialShortage && !initialFulfillment) {
      return { kind: "io", groupKey: ioSplitPlans[0]!.groupKey };
    }
    if (
      manualSplitPlans.length > 0 &&
      !initialFull &&
      !initialShortage &&
      !initialFulfillment &&
      !hasOfficial
    ) {
      return { kind: "manual", planId: manualSplitPlans[0]!.planId };
    }
    return { kind: "all" };
  });

  const [manualBagId, setManualBagId] = useState<number | null>(null);

  const [internalAllTab, setInternalAllTab] = useState<ListTab>(() => {
    if (controlledAllTab) return controlledAllTab;
    if (isSetSubject) return "official";
    if (initialFull) return "full";
    if (initialFulfillment) return "fulfillment";
    if (initialShortage) return "shortage";
    if (hasOfficial) return "official";
    return "full";
  });

  const allTab = controlledAllTab ?? internalAllTab;
  const setAllTab = useCallback(
    (tab: ListTab) => {
      if (onAllTabChange) onAllTabChange(tab);
      else setInternalAllTab(tab);
    },
    [onAllTabChange],
  );

  const allFulfillmentDisplay = useMemo(() => {
    if (!initialFulfillment) return null;
    const items = fulfillmentItemsForDisplay(initialFulfillment.items);
    if (!items.length) return null;
    return { ...initialFulfillment, items };
  }, [initialFulfillment]);

  const [ioSecondary, setIoSecondary] = useState<IoSecondary | null>(null);
  const [ioExportSheet, setIoExportSheet] = useState<IoSplitSheetState | null>(null);

  const activePlan = useMemo(
    () =>
      primary.kind === "io"
        ? ioSplitPlans.find((p) => p.groupKey === primary.groupKey)
        : null,
    [primary, ioSplitPlans]
  );

  const activeManualPlan = useMemo(
    () =>
      primary.kind === "manual"
        ? manualSplitPlans.find((p) => p.planId === primary.planId) ?? null
        : null,
    [primary, manualSplitPlans]
  );

  const activePlanIndex = useMemo(
    () => (activePlan ? ioSplitPlans.findIndex((p) => p.groupKey === activePlan.groupKey) : -1),
    [activePlan, ioSplitPlans]
  );

  const activeManualPlanIndex = useMemo(
    () =>
      activeManualPlan
        ? manualSplitPlans.findIndex((p) => p.planId === activeManualPlan.planId)
        : -1,
    [activeManualPlan, manualSplitPlans]
  );

  const activePlanGroupKey = primary.kind === "io" ? primary.groupKey : null;
  const activeManualPlanId = primary.kind === "manual" ? primary.planId : null;
  const activePlanBatchIdsKey =
    activePlan?.batches.map((b) => b.id).join(",") ?? "";

  useEffect(() => {
    if (primary.kind !== "io" || !activePlan?.batches.length) {
      setIoSecondary(null);
      return;
    }
    const firstBatchId = activePlan.batches[0]!.id;
    setIoSecondary((prev) => {
      if (
        prev?.kind === "batch" &&
        activePlan.batches.some((b) => b.id === prev.batchId)
      ) {
        return prev;
      }
      if (prev?.kind === "merged-shortage") return prev;
      return { kind: "batch", batchId: firstBatchId };
    });
  }, [activePlan, activePlanBatchIdsKey, activePlanGroupKey, primary.kind]);

  useEffect(() => {
    if (primary.kind !== "manual" || !activeManualPlan?.bags.length) {
      setManualBagId(null);
      return;
    }
    const firstId = activeManualPlan.bags[0]!.id;
    setManualBagId((prev) =>
      prev != null && activeManualPlan.bags.some((b) => b.id === prev) ? prev : firstId
    );
  }, [activeManualPlan, activeManualPlanId, primary.kind]);

  const ioSecondaryBatchId = ioSecondary?.kind === "batch" ? ioSecondary.batchId : null;

  const activeBatch = useMemo(() => {
    if (ioSecondary?.kind !== "batch" || !activePlan) return null;
    return activePlan.batches.find((b) => b.id === ioSecondary.batchId) ?? null;
  }, [activePlan, ioSecondary]);

  const activeBatchIndex = useMemo(() => {
    if (!activeBatch || !activePlan) return -1;
    return activePlan.batches.findIndex((b) => b.id === activeBatch.id);
  }, [activeBatch, activePlan]);

  const planBatchIdsKey = useMemo(
    () => activePlan?.batches.map((b) => b.id).join(",") ?? "",
    [activePlan],
  );
  const planBatchIds = useMemo(
    () =>
      planBatchIdsKey
        ? planBatchIdsKey.split(",").map((s) => Number(s)).filter((id) => id > 0)
        : [],
    [planBatchIdsKey],
  );

  const ioViewerMode = useMemo(() => {
    if (ioSecondary?.kind === "merged-shortage") return "plan-merged-shortage" as const;
    if (ioSecondary?.kind === "batch") return "batch-fulfillment" as const;
    return null;
  }, [ioSecondary]);

  const ioExportListTab = useMemo((): "full" | "shortage" | "fulfillment" => {
    if (ioSecondary?.kind === "merged-shortage") return "shortage";
    return "fulfillment";
  }, [ioSecondary]);

  const ioExportFilenameStem = useMemo(() => {
    if (!activePlan || activePlanIndex < 0) return undefined;
    const planLabel = planDisplayName(activePlan, activePlanIndex);
    if (ioSecondary?.kind === "merged-shortage") {
      return buildIoPlanMergedShortageExportStem({
        mocId: subjectId,
        displayName: exportDisplayName,
        planLabel,
      });
    }
    if (ioSecondary?.kind === "batch" && activeBatch && activeBatchIndex >= 0) {
      return buildIoSplitBatchExportStem({
        mocId: subjectId,
        displayName: exportDisplayName,
        planLabel,
        batchLabel: batchTabLabel(activeBatch, activeBatchIndex),
      });
    }
    return undefined;
  }, [activeBatch, activeBatchIndex, activePlan, activePlanIndex, exportDisplayName, ioSecondary, subjectId]);

  const handleIoSheetLoaded = useCallback((sheet: IoSplitSheetState | null) => {
    setIoExportSheet((prev) => {
      if (!sheet && !prev) return prev;
      if (
        sheet &&
        prev &&
        sheet.savedAt === prev.savedAt &&
        sheet.items.length === prev.items.length &&
        sheet.skippedHeader === prev.skippedHeader
      ) {
        return prev;
      }
      return sheet;
    });
  }, []);

  const prefetchedBatchIdsRef = useRef(new Set<number>());

  /** 预取当前分包高砖可购零件（每包仅一次） */
  useEffect(() => {
    if (primary.kind !== "io" || ioSecondaryBatchId == null) return;
    const batchId = ioSecondaryBatchId;
    if (prefetchedBatchIdsRef.current.has(batchId)) return;
    prefetchedBatchIdsRef.current.add(batchId);

    let cancelled = false;
    void loadIoSplitSheet(ioBatchSheetLoadKey("batch-fulfillment", batchId), async () => {
      const r = await fetchIoBatchFulfillmentSheetAction(batchId);
      if (!r.ok) return { ok: false as const, error: r.error };
      if (!r.items.length) return { ok: false as const, error: "暂无数据" };
      return {
        ok: true as const,
        sheet: {
          items: r.items,
          skippedHeader: r.skippedHeader,
          savedAt: r.savedAt,
        },
      };
    }).then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [ioSecondaryBatchId, primary.kind]);

  const selectPrimaryAll = useCallback(() => setPrimary({ kind: "all" }), []);

  const selectPrimaryPlan = useCallback((groupKey: string) => {
    setPrimary({ kind: "io", groupKey });
  }, []);

  const selectManualPlan = useCallback((planId: number) => {
    setPrimary({ kind: "manual", planId });
  }, []);

  const handlePlanDeleted = useCallback(() => {
    setPrimary({ kind: "all" });
    setIoSecondary(null);
    setIoExportSheet(null);
    setManualBagId(null);
  }, []);

  useEffect(() => {
    if (primary.kind !== "io") return;
    if (!ioSplitPlans.some((p) => p.groupKey === primary.groupKey)) {
      handlePlanDeleted();
    }
  }, [handlePlanDeleted, ioSplitPlans, primary]);

  useEffect(() => {
    if (primary.kind !== "manual") return;
    if (!manualSplitPlans.some((p) => p.planId === primary.planId)) {
      handlePlanDeleted();
    }
  }, [handlePlanDeleted, manualSplitPlans, primary]);

  const officialMetaLine =
    officialInventory != null
      ? `Rebrickable 本地库存 · inventory_id ${officialInventory.inventoryId} · 版本 v${officialInventory.version}`
      : "";

  const planMeta =
    activePlan && activePlanIndex >= 0 ? (
      <p className="mb-3 text-xs text-[var(--muted)]">
        {activePlan.attachmentName} · {activePlan.splitConfigSummary}
        {ioSecondary?.kind === "batch" ? (
          <>
            {" · "}
            {(() => {
              const b = activePlan.batches.find((x) => x.id === ioSecondary.batchId);
              if (!b) return null;
              const idx = activePlan.batches.findIndex((x) => x.id === b.id);
              const price = formatGobricksGdsPriceCny(b.gobricksGdsPriceCny);
              return `${batchTabLabel(b, idx >= 0 ? idx : 0)} · ${b.totalPartQty} 片${price ? ` · 参考价 ${price}` : ""}`;
            })()}
          </>
        ) : null}
        {ioSecondary?.kind === "merged-shortage" ? <> · 缺件表</> : null}
      </p>
    ) : null;

  const manualPlanMeta =
    activeManualPlan && activeManualPlanIndex >= 0 ? (
      <p className="mb-3 text-xs text-[var(--muted)]">
        手动分包 · 源
        {activeManualPlan.sourceKind === "official" ? "官方清单" : "完整零件表"}
        {manualBagId != null
          ? (() => {
              const b = activeManualPlan.bags.find((x) => x.id === manualBagId);
              if (!b) return null;
              return ` · ${b.label.trim() || "分包"} · ${b.totalPartQty} 片`;
            })()
          : null}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <nav
        className="flex shrink-0 flex-row gap-1 overflow-x-auto sm:w-36 sm:flex-col sm:overflow-visible sm:border-r sm:border-[var(--border-soft)] sm:pr-3"
        aria-label="零件表方案"
      >
        <button
          type="button"
          className={`${navBtn} ${primary.kind === "all" ? navBtnActive : navBtnIdle}`}
          onClick={selectPrimaryAll}
        >
          全部
        </button>
        {manualSplitPlans.map((plan, i) => {
          const isActive = primary.kind === "manual" && primary.planId === plan.planId;
          const label = plan.name.trim() || `手动分包${i + 1}`;
          const title = `手动分包 · ${plan.sourceKind === "official" ? "官方清单" : "完整零件表"}`;

          if (!isActive) {
            return (
              <button
                key={`manual-${plan.planId}`}
                type="button"
                title={title}
                className={`${navBtn} ${navBtnIdle}`}
                onClick={() => selectManualPlan(plan.planId)}
              >
                {label}
              </button>
            );
          }

          return (
            <div
              key={`manual-${plan.planId}`}
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-0.5 gap-y-1.5"
            >
              <button
                type="button"
                title={title}
                className={`${navBtn} ${navBtnActive} min-w-0 truncate`}
                onClick={() => selectManualPlan(plan.planId)}
              >
                {label}
              </button>
              <ManualSplitPlanDeleteButton
                variant="compact"
                subjectKind={subjectKind}
                subjectId={subjectId}
                planId={plan.planId}
                planDisplayName={label}
                bagCount={plan.bags.length}
                onDeleted={handlePlanDeleted}
              />
            </div>
          );
        })}
        {ioSplitPlans.map((plan, i) => {
          const isActive = primary.kind === "io" && primary.groupKey === plan.groupKey;
          const label = planDisplayName(plan, i);
          const title = `${plan.attachmentName} · ${plan.splitConfigSummary}`;

          if (!isActive) {
            return (
              <button
                key={plan.groupKey}
                type="button"
                title={title}
                className={`${navBtn} ${navBtnIdle}`}
                onClick={() => selectPrimaryPlan(plan.groupKey)}
              >
                {label}
              </button>
            );
          }

          return (
            <div
              key={plan.groupKey}
              className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-0.5 gap-y-1.5"
            >
              <button
                type="button"
                title={title}
                className={`${navBtn} ${navBtnActive} min-w-0 truncate`}
                onClick={() => selectPrimaryPlan(plan.groupKey)}
              >
                {label}
              </button>
              {subjectKind === BUILD_SUBJECT_MOC ? (
                <MocIoSplitPlanDeleteButton
                  variant="compact"
                  mocId={subjectId}
                  groupKey={plan.groupKey}
                  planDisplayName={label}
                  batchCount={plan.batches.length}
                  onDeleted={handlePlanDeleted}
                />
              ) : null}
            </div>
          );
        })}
      </nav>

      <div
        className={`min-w-0 flex-1 ${
          primary.kind === "io" || primary.kind === "manual" ? "min-h-[min(42vh,28rem)]" : ""
        }`}
      >
        {primary.kind === "all" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {isSetSubject ? (
                  <>
                    <button
                      type="button"
                      className={`${subTabBtn} ${allTab === "official" ? subTabActive : subTabIdle}`}
                      onClick={() => setAllTab("official")}
                    >
                      完整零件表
                    </button>
                    <button
                      type="button"
                      disabled={!initialFulfillment}
                      className={`${subTabBtn} ${allTab === "fulfillment" ? subTabActive : subTabIdle} ${!initialFulfillment ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => initialFulfillment && setAllTab("fulfillment")}
                    >
                      配货表
                    </button>
                    <button
                      type="button"
                      disabled={!initialShortage}
                      className={`${subTabBtn} ${allTab === "shortage" ? subTabActive : subTabIdle} ${!initialShortage ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => initialShortage && setAllTab("shortage")}
                    >
                      缺件表
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!initialFull}
                      className={`${subTabBtn} ${allTab === "full" ? subTabActive : subTabIdle} ${!initialFull ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => initialFull && setAllTab("full")}
                    >
                      完整零件表
                    </button>
                    <button
                      type="button"
                      disabled={!allFulfillmentDisplay}
                      className={`${subTabBtn} ${allTab === "fulfillment" ? subTabActive : subTabIdle} ${!allFulfillmentDisplay ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => allFulfillmentDisplay && setAllTab("fulfillment")}
                    >
                      配货表
                    </button>
                    <button
                      type="button"
                      disabled={!initialShortage}
                      className={`${subTabBtn} ${allTab === "shortage" ? subTabActive : subTabIdle} ${!initialShortage ? "cursor-not-allowed opacity-45" : ""}`}
                      onClick={() => initialShortage && setAllTab("shortage")}
                    >
                      缺件表
                    </button>
                    {hasOfficial ? (
                      <button
                        type="button"
                        className={`${subTabBtn} ${allTab === "official" ? subTabActive : subTabIdle}`}
                        onClick={() => setAllTab("official")}
                      >
                        官方清单
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManualSplit &&
                ((isSetSubject && allTab === "official") ||
                  (!isSetSubject && allTab === "full")) ? (
                  <ManualSplitStartButton subjectKind={subjectKind} subjectId={subjectId} />
                ) : null}
                {(allTab === "full" || allTab === "shortage" || allTab === "fulfillment") &&
                subjectKind === BUILD_SUBJECT_MOC ? (
                  <MocDetailPartsListExportBar
                    subjectKind={subjectKind}
                    subjectId={subjectId}
                    exportDisplayName={exportDisplayName}
                    listTab={allTab}
                    initialFull={initialFull}
                    initialShortage={initialShortage}
                    initialFulfillment={allFulfillmentDisplay ?? initialFulfillment}
                  />
                ) : null}
              </div>
            </div>

            <div id={!isSetSubject ? MOC_PARTS_TAB_HASH[allTab] : undefined}>
              {allTab === "full" && initialFull ? (
                <MocPartsList
                  items={initialFull.items}
                  skippedHeader={initialFull.skippedHeader}
                  savedAt={initialFull.savedAt}
                />
              ) : null}
              {allTab === "fulfillment" && allFulfillmentDisplay ? (
                <MocPartsList
                  items={allFulfillmentDisplay.items}
                  skippedHeader={allFulfillmentDisplay.skippedHeader}
                  savedAt={allFulfillmentDisplay.savedAt}
                  detailSubstituteSuggestions
                  sheetRowReplaceContext={{
                    subjectKind,
                    subjectId,
                    branch: "fulfillment",
                  }}
                />
              ) : null}
              {allTab === "shortage" && initialShortage ? (
                <MocPartsList
                  items={initialShortage.items}
                  skippedHeader={initialShortage.skippedHeader}
                  savedAt={initialShortage.savedAt}
                  shortageListMode
                  detailSubstituteSuggestions
                  sheetRowReplaceContext={{ subjectKind, subjectId, branch: "shortage" }}
                />
              ) : null}
              {allTab === "official" && officialInventory ? (
                officialInventory.items.length > 0 ? (
                  <MocPartsList
                    items={officialInventory.items}
                    skippedHeader={false}
                    savedAt="2000-01-01T00:00:00.000Z"
                    sourceMetaLine={officialMetaLine}
                  />
                ) : (
                  <p className="text-sm text-[var(--muted)]">本地库存中暂无该套装的零件行。</p>
                )
              ) : null}
              {allTab === "full" && !initialFull ? (
                <p className="text-sm text-[var(--muted)]">尚未上传完整零件表。</p>
              ) : null}
              {allTab === "fulfillment" && !allFulfillmentDisplay ? (
                <p className="text-sm text-[var(--muted)]">
                  {initialFulfillment
                    ? "该包尚无配货零件行。"
                    : "尚无配货表。"}
                </p>
              ) : null}
              {allTab === "shortage" && !initialShortage ? (
                <p className="text-sm text-[var(--muted)]">尚无缺件表。</p>
              ) : null}
            </div>
          </>
        ) : activeManualPlan ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {activeManualPlan.bags.map((b, i) => {
                  const isActive = manualBagId === b.id;
                  const label = b.label.trim() || (b.isRemainder ? "剩余" : ioSplitPackageLabel(i + 1));
                  return (
                    <button
                      key={b.id}
                      type="button"
                      title={`${label} · ${b.totalPartQty} 片`}
                      className={`${subTabBtn} inline-flex items-baseline gap-1.5 ${
                        isActive ? subTabActive : subTabIdle
                      }`}
                      onClick={() => setManualBagId(b.id)}
                    >
                      <span>{label}</span>
                      <span
                        className={`tabular-nums text-[10px] sm:text-[11px] ${
                          isActive ? "text-[var(--muted)]" : "text-[var(--muted-2)]"
                        }`}
                      >
                        {b.totalPartQty} 片
                      </span>
                    </button>
                  );
                })}
              </div>
              <Link
                href={buildSubjectManualSplitPath(subjectKind, subjectId, activeManualPlan.planId)}
                className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--text)] hover:opacity-90"
              >
                继续编辑
              </Link>
            </div>
            {manualPlanMeta}
            {manualBagId != null ? <ManualSplitBagViewer bagId={manualBagId} /> : null}
          </>
        ) : activePlan ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {activePlan.batches.map((b, i) => {
                  const batchPrice = formatGobricksGdsPriceCny(b.gobricksGdsPriceCny);
                  const isActive =
                    ioSecondary?.kind === "batch" && ioSecondary.batchId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      title={batchTabTitle(b, i)}
                      className={`${subTabBtn} inline-flex items-baseline gap-1.5 ${
                        isActive ? subTabActive : subTabIdle
                      }`}
                      onClick={() => setIoSecondary({ kind: "batch", batchId: b.id })}
                    >
                      <span>{batchTabLabel(b, i)}</span>
                      <span
                        className={`tabular-nums text-[10px] sm:text-[11px] ${
                          isActive ? "text-[var(--muted)]" : "text-[var(--muted-2)]"
                        }`}
                      >
                        {b.totalPartQty} 片
                      </span>
                      {batchPrice ? (
                        <span
                          className={`font-mono text-[10px] tabular-nums sm:text-[11px] ${
                            isActive ? "text-[var(--muted)]" : "text-[var(--muted-2)]"
                          }`}
                        >
                          {batchPrice}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`${subTabBtn} ${
                    ioSecondary?.kind === "merged-shortage" ? subTabActive : subTabIdle
                  }`}
                  onClick={() => setIoSecondary({ kind: "merged-shortage" })}
                >
                  缺件表
                </button>
              </div>
              {subjectKind === BUILD_SUBJECT_MOC ? (
                <MocDetailPartsListExportBar
                  subjectKind={subjectKind}
                  subjectId={subjectId}
                  exportDisplayName={exportDisplayName}
                  listTab={ioExportListTab}
                  activeSheet={ioExportSheet}
                  filenameStemOverride={ioExportFilenameStem}
                />
              ) : null}
            </div>
            {planMeta}
            {ioViewerMode === "plan-merged-shortage" ? (
              <MocIoSplitSheetViewer
                mode="plan-merged-shortage"
                batchIds={planBatchIds}
                subjectKind={subjectKind}
                subjectId={subjectId}
                planBatchIds={planBatchIds}
                onSheetLoaded={handleIoSheetLoaded}
              />
            ) : ioViewerMode === "batch-fulfillment" && activeBatch ? (
              <MocIoSplitSheetViewer
                mode="batch-fulfillment"
                batchId={activeBatch.id}
                subjectKind={subjectKind}
                subjectId={subjectId}
                planBatchIds={planBatchIds}
                onSheetLoaded={handleIoSheetLoaded}
              />
            ) : null}
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">未找到分包方案。</p>
        )}
      </div>
    </div>
  );
}
