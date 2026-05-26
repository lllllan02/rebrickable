"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { GoodPriceListSortControl } from "@/app/sets/good-price-list-sort-control";
import {
  clearSetGoodPriceAction,
  fetchSetGoodPriceGobricksCompareAction,
  markSetOwnedFromGoodPriceAction,
} from "@/app/sets/set-good-price-actions";
import {
  SetGoodPriceBomDialog,
  type SetGoodPriceBomDialogTarget,
} from "@/app/sets/set-good-price-bom-dialog";
import {
  SetGoodPriceEditDialog,
  type SetGoodPriceEditDraft,
} from "@/app/sets/set-good-price-edit-dialog";
import { SetGoodPriceListRow } from "@/app/sets/set-good-price-list-row";
import {
  goodPriceBtnDanger,
  goodPriceBtnGobricks,
  goodPriceBtnOwned,
  goodPriceBtnPrimary,
  goodPriceBtnSecondary,
} from "@/lib/set-good-price-buttons";
import type { SetGoodPriceListItem } from "@/lib/set-good-price-list-sort";
import type { SetGoodPriceListSortState } from "@/lib/set-good-price-list-sort";

export type GoodPriceListRowProps = SetGoodPriceListItem & {
  title: string;
  coverUrl: string | null;
};

type Props = {
  items: GoodPriceListRowProps[];
  sortState: SetGoodPriceListSortState;
};

export function GoodPricesListClient({ items, sortState }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [gobricksSetNum, setGobricksSetNum] = useState<string | null>(null);
  const [draft, setDraft] = useState<SetGoodPriceEditDraft | null>(null);
  const [bomTarget, setBomTarget] = useState<SetGoodPriceBomDialogTarget | null>(null);

  const openCreate = () => {
    setDraft({
      mode: "create",
      setNum: "",
      priceNewCny: null,
      priceUsedCny: null,
    });
  };

  const openEdit = (item: GoodPriceListRowProps) => {
    setDraft({
      mode: "edit",
      setNum: item.setNum,
      catalogName: item.catalogName,
      priceNewCny: item.priceNewCny,
      priceUsedCny: item.priceUsedCny,
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

  return (
    <>
      <div className="mb-3 flex w-full flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] px-1 pb-3">
        <GoodPriceListSortControl sortState={sortState} />
        <button type="button" onClick={openCreate} className={goodPriceBtnPrimary}>
          添加好价
        </button>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-[var(--muted)]">
          尚无记录。点击右上角「添加好价」录入套装编号与价格。
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <SetGoodPriceListRow
              key={item.setNum}
              setNum={item.setNum}
              title={item.title}
              coverUrl={item.coverUrl}
              priceNewCny={item.priceNewCny}
              priceUsedCny={item.priceUsedCny}
              updatedAtIso={item.updatedAt}
              numParts={item.numParts}
              totalStudUnits={item.totalStudUnits}
              studCoverageRatio={item.studCoverageRatio}
              year={item.year}
              gobricksPriceCny={item.gobricksPriceCny}
              gobricksMatchPercent={item.gobricksMatchPercent}
              gobricksComparedAt={item.gobricksComparedAt}
              sortKind={sortState.kind}
              onPartsClick={
                typeof item.numParts === "number" && item.numParts > 0
                  ? () => setBomTarget({ setNum: item.setNum, title: item.title })
                  : undefined
              }
              actions={
                <>
                  <button
                    type="button"
                    onClick={() => compareGobricks(item)}
                    disabled={pending}
                    className={goodPriceBtnGobricks}
                    title="用官方 BOM 请求高砖，统计零件总价（颜色未匹配也计价，仅零件未匹配忽略）"
                  >
                    {gobricksSetNum === item.setNum ? "比价中…" : "高砖比价"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    disabled={pending}
                    className={goodPriceBtnSecondary}
                  >
                    编辑
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
          ))}
        </ul>
      )}

      <SetGoodPriceEditDialog draft={draft} onClose={() => setDraft(null)} />
      <SetGoodPriceBomDialog target={bomTarget} onClose={() => setBomTarget(null)} />
    </>
  );
}
