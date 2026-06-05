"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { GoodPriceListSortControl } from "@/app/sets/good-price-list-sort-control";
import {
  clearSetGoodPriceAction,
  fetchSetGoodPriceGobricksCompareAction,
  fetchSetGoodPricePriceHistoryAction,
  fetchSetGoodPriceSalesStatusAction,
  markSetOwnedFromGoodPriceAction,
  markSetWantedFromGoodPriceAction,
  unmarkSetWantedFromGoodPriceAction,
} from "@/app/sets/set-good-price-actions";
import {
  SetGoodPriceBomDialog,
  type SetGoodPriceBomDialogTarget,
} from "@/app/sets/set-good-price-bom-dialog";
import {
  SetGoodPricePriceHistoryDialog,
  type SetGoodPricePriceHistoryDialogTarget,
} from "@/app/sets/set-good-price-price-history-dialog";
import {
  SetGoodPriceEditForm,
  type SetGoodPriceEditDraft,
} from "@/app/sets/set-good-price-edit-form";
import { SetGoodPriceListRow } from "@/app/sets/set-good-price-list-row";
import {
  goodPriceBtnDanger,
  goodPriceBtnGobricks,
  goodPriceBtnOwned,
  goodPriceBtnPrimary,
  goodPriceBtnSalesStatus,
  goodPriceBtnSecondary,
} from "@/lib/set-good-price-buttons";
import type { SetGoodPriceHeatFilter } from "@/lib/set-good-price-heat";
import { setGoodPriceHeatFilterLabel } from "@/lib/set-good-price-heat";
import type { SetGoodPriceListItem } from "@/lib/set-good-price-list-sort";
import type { SetGoodPriceListSortState } from "@/lib/set-good-price-list-sort";
import type { SetListMarkFilter } from "@/lib/build-list-mark-filter";
import {
  hasBricktimePriceHistoryForCurrentMonth,
  parseBricktimePriceHistoryJson,
} from "@/lib/bricktime-price-history";
import { shouldHideBricktimeSalesStatusRefresh } from "@/lib/set-good-price-format";

export type GoodPriceListRowProps = SetGoodPriceListItem & {
  title: string;
  coverUrl: string | null;
};

type Props = {
  items: GoodPriceListRowProps[];
  sortState: SetGoodPriceListSortState;
  heatFilter: SetGoodPriceHeatFilter;
  markFilter: SetListMarkFilter;
};

export function GoodPricesListClient({ items, sortState, heatFilter, markFilter }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gobricksSetNum, setGobricksSetNum] = useState<string | null>(null);
  const [priceHistorySetNum, setPriceHistorySetNum] = useState<string | null>(null);
  const [salesStatusSetNum, setSalesStatusSetNum] = useState<string | null>(null);
  const [draft, setDraft] = useState<SetGoodPriceEditDraft | null>(null);
  const [bomTarget, setBomTarget] = useState<SetGoodPriceBomDialogTarget | null>(null);
  const [priceHistoryTarget, setPriceHistoryTarget] =
    useState<SetGoodPricePriceHistoryDialogTarget | null>(null);

  const openCreate = () => {
    setDraft((prev) =>
      prev?.mode === "create"
        ? null
        : {
            mode: "create",
            setNum: "",
            priceNewCny: null,
          }
    );
  };

  const openEdit = (item: GoodPriceListRowProps) => {
    setDraft({
      mode: "edit",
      setNum: item.setNum,
      catalogName: item.catalogName,
      priceNewCny: item.priceNewCny,
      bricktimeOfficialPrice: item.bricktimeOfficialPrice,
      bricktimeGoodPrice: item.bricktimeGoodPrice,
      bricktimeLowestPrice: item.bricktimeLowestPrice,
      bricktimeFetchedAt: item.bricktimeFetchedAt,
      bricktimeLaunchDate: item.bricktimeLaunchDate,
      bricktimeRetiredDate: item.bricktimeRetiredDate,
      bricktimeSalesStatus: item.bricktimeSalesStatus,
      bricktimeSalesStatusFetchedAt: item.bricktimeSalesStatusFetchedAt,
      bricktimeWeight: item.bricktimeWeight,
      bricktimeBuildingTime: item.bricktimeBuildingTime,
      bricktimePriceHistory: parseBricktimePriceHistoryJson(item.bricktimePriceHistory),
      gobricksPriceCny: item.gobricksPriceCny,
      gobricksMatchPercent: item.gobricksMatchPercent,
      gobricksComparedAt: item.gobricksComparedAt,
    });
  };

  const openPriceHistory = (item: GoodPriceListRowProps) => {
    const priceHistory = parseBricktimePriceHistoryJson(item.bricktimePriceHistory);
    if (priceHistory.length === 0) return;
    setPriceHistoryTarget({
      setNum: item.setNum,
      title: item.title,
      officialPrice: item.bricktimeOfficialPrice,
      priceHistory,
    });
  };

  const markOwned = (item: GoodPriceListRowProps) => {
    startTransition(async () => {
      const res = await markSetOwnedFromGoodPriceAction({ setNum: item.setNum });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  const toggleWanted = (item: GoodPriceListRowProps) => {
    const isWanted = item.workflowStage === "replicate";
    startTransition(async () => {
      const res = isWanted
        ? await unmarkSetWantedFromGoodPriceAction({ setNum: item.setNum })
        : await markSetWantedFromGoodPriceAction({ setNum: item.setNum });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  const remove = (item: GoodPriceListRowProps) => {
    startTransition(async () => {
      const res = await clearSetGoodPriceAction({ setNum: item.setNum });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  const compareGobricks = (item: GoodPriceListRowProps) => {
    setGobricksSetNum(item.setNum);
    startTransition(async () => {
      const res = await fetchSetGoodPriceGobricksCompareAction({ setNum: item.setNum });
      setGobricksSetNum(null);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  const refreshPriceHistory = (item: GoodPriceListRowProps) => {
    setPriceHistorySetNum(item.setNum);
    startTransition(async () => {
      const res = await fetchSetGoodPricePriceHistoryAction({ setNum: item.setNum });
      setPriceHistorySetNum(null);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  const refreshSalesStatus = (item: GoodPriceListRowProps) => {
    setSalesStatusSetNum(item.setNum);
    startTransition(async () => {
      const res = await fetchSetGoodPriceSalesStatusAction({ setNum: item.setNum });
      setSalesStatusSetNum(null);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] px-1 pb-3">
        <GoodPriceListSortControl
          sortState={sortState}
          heatFilter={heatFilter}
          markFilter={markFilter}
        />
        <button type="button" onClick={openCreate} className={goodPriceBtnPrimary}>
          {draft?.mode === "create" ? "取消添加" : "添加好价"}
        </button>
      </div>

      {draft?.mode === "create" ? (
        <div className="mb-3">
          <SetGoodPriceEditForm
            draft={draft}
            variant="create"
            onClose={() => setDraft(null)}
            onViewPriceHistory={(payload) => setPriceHistoryTarget(payload)}
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">
          {markFilter === "replicate"
            ? "暂无心动好价。可以在全部好价中点击封面上的心动按钮。"
            : heatFilter.kind === "exact"
            ? `无${setGoodPriceHeatFilterLabel(heatFilter)}的套装。再点当前圆点可取消筛选。`
            : "尚无记录。点击右上角「添加好价」录入套装编号与价格。"}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const isEditing = draft?.mode === "edit" && draft.setNum === item.setNum;
            const parsedPriceHistory = parseBricktimePriceHistoryJson(item.bricktimePriceHistory);
            const hidePriceHistoryRefresh = hasBricktimePriceHistoryForCurrentMonth(
              parsedPriceHistory
            );
            const hideSalesStatusRefresh = shouldHideBricktimeSalesStatusRefresh(
              item.bricktimeSalesStatus,
              item.bricktimeSalesStatusFetchedAt
            );
            const hideGobricksCompare =
              typeof item.gobricksPriceCny === "number" && Number.isFinite(item.gobricksPriceCny);
            return (
            <SetGoodPriceListRow
              key={item.setNum}
              setNum={item.setNum}
              title={item.title}
              coverUrl={item.coverUrl}
              priceNewCny={item.priceNewCny}
              updatedAtIso={item.updatedAt}
              numParts={item.numParts}
              year={item.year}
              gobricksPriceCny={item.gobricksPriceCny}
              gobricksMatchPercent={item.gobricksMatchPercent}
              gobricksComparedAt={item.gobricksComparedAt}
              bricktimeOfficialPrice={item.bricktimeOfficialPrice}
              bricktimeGoodPrice={item.bricktimeGoodPrice}
              bricktimeLowestPrice={item.bricktimeLowestPrice}
              bricktimeRecentLowPrice={item.bricktimeRecentLowPrice}
              bricktimeFetchedAt={item.bricktimeFetchedAt}
              bricktimeLaunchDate={item.bricktimeLaunchDate}
              bricktimeRetiredDate={item.bricktimeRetiredDate}
              bricktimeSalesStatus={item.bricktimeSalesStatus}
              bricktimeSalesStatusFetchedAt={item.bricktimeSalesStatusFetchedAt}
              bricktimeWeight={item.bricktimeWeight}
              bricktimeBuildingTime={item.bricktimeBuildingTime}
              bricktimePriceHistory={item.bricktimePriceHistory}
              workflowStage={item.workflowStage}
              onMarkWanted={() => toggleWanted(item)}
              markWantedDisabled={pending}
              onViewPriceHistory={() => openPriceHistory(item)}
              isEditing={isEditing}
              editForm={
                isEditing && draft ? (
                  <SetGoodPriceEditForm
                    draft={draft}
                    onClose={() => setDraft(null)}
                    onViewPriceHistory={(payload) => setPriceHistoryTarget(payload)}
                  />
                ) : undefined
              }
              onPartsClick={
                typeof item.numParts === "number" && item.numParts > 0
                  ? () => setBomTarget({ setNum: item.setNum, title: item.title })
                  : undefined
              }
              actions={
                <>
                  {hidePriceHistoryRefresh ? null : (
                    <button
                      type="button"
                      onClick={() => refreshPriceHistory(item)}
                      disabled={pending}
                      className={goodPriceBtnSecondary}
                      title="只调用 Bricktime /sets/{id}/prices_history，更新价格历史与史低"
                    >
                      {priceHistorySetNum === item.setNum ? "更新中…" : "价格历史"}
                    </button>
                  )}
                  {hideSalesStatusRefresh ? null : (
                    <button
                      type="button"
                      onClick={() => refreshSalesStatus(item)}
                      disabled={pending}
                      className={goodPriceBtnSalesStatus}
                      title="只调用 Bricktime /sets/{id}，更新销售状态与元数据"
                    >
                      {salesStatusSetNum === item.setNum ? "更新中…" : "销售状态"}
                    </button>
                  )}
                  {hideGobricksCompare ? null : (
                    <button
                      type="button"
                      onClick={() => compareGobricks(item)}
                      disabled={pending}
                      className={goodPriceBtnGobricks}
                      title="用官方 BOM 请求高砖，统计零件总价（颜色未匹配也计价，仅零件未匹配忽略）"
                    >
                      {gobricksSetNum === item.setNum ? "比价中…" : "高砖比价"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => (isEditing ? setDraft(null) : openEdit(item))}
                    disabled={pending}
                    className={goodPriceBtnSecondary}
                  >
                    {isEditing ? "取消" : "编辑"}
                  </button>
                  <button
                    type="button"
                    onClick={() => markOwned(item)}
                    disabled={pending}
                    className={goodPriceBtnOwned}
                  >
                    拥有
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    disabled={pending}
                    className={goodPriceBtnDanger}
                  >
                    删除
                  </button>
                </>
              }
            />
            );
          })}
        </ul>
      )}

      <SetGoodPriceBomDialog target={bomTarget} onClose={() => setBomTarget(null)} />
      <SetGoodPricePriceHistoryDialog
        target={priceHistoryTarget}
        onClose={() => setPriceHistoryTarget(null)}
      />
    </>
  );
}
