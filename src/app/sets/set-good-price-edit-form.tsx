"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  clearSetGoodPriceAction,
  previewSetGoodPriceGobricksCompareAction,
  previewSetGoodPriceOfficialPriceAction,
  previewSetGoodPricePriceHistoryAction,
  previewSetGoodPriceSalesStatusAction,
  saveSetGoodPriceAction,
} from "@/app/sets/set-good-price-actions";
import {
  SetGoodPriceReferencePanel,
  type SetGoodPriceReferencePreview,
} from "@/app/sets/set-good-price-reference-panel";
import { SetGoodPriceTimestampsLine } from "@/app/sets/set-good-price-timestamps-line";
import { SetGoodPriceBricktimeMetaLine } from "@/app/sets/set-good-price-bricktime-meta-line";
import { hasAnySetGoodPrice } from "@/lib/set-good-price-channel";
import {
  goodPriceBtnDanger,
  goodPriceBtnPrimary,
  goodPriceBtnSecondary,
} from "@/lib/set-good-price-buttons";
import {
  isBricktimeRetiredSalesStatus,
  parseOptionalBricktimePriceInput,
} from "@/lib/set-good-price-format";
import type { BricktimeSetMetaFields } from "@/lib/set-good-price-format";
import {
  hasBricktimePriceHistoryForCurrentMonth,
  type BricktimePriceHistoryPoint,
} from "@/lib/bricktime-price-history";
import type { SetGoodPricePriceHistoryDialogTarget } from "@/app/sets/set-good-price-price-history-dialog";

export type SetGoodPriceEditDraft = {
  mode: "create" | "edit";
  setNum: string;
  catalogName?: string | null;
  priceNewCny: number | null;
  priceUsedCny: number | null;
  bricktimeOfficialPrice?: string | null;
  bricktimeGoodPrice?: string | null;
  bricktimeLowestPrice?: string | null;
  bricktimeFetchedAt?: string | null;
  bricktimeLaunchDate?: string | null;
  bricktimeRetiredDate?: string | null;
  bricktimeSalesStatus?: string | null;
  bricktimeWeight?: string | null;
  bricktimeBuildingTime?: string | null;
  bricktimePriceHistory?: BricktimePriceHistoryPoint[] | null;
  gobricksPriceCny?: number | null;
  gobricksMatchPercent?: number | null;
  gobricksComparedAt?: string | null;
};

function priceToInput(v: number | null): string {
  return v != null ? String(v) : "";
}

const emptyBricktimeMeta = (): BricktimeSetMetaFields => ({
  launchDate: null,
  retiredDate: null,
  salesStatus: null,
  weight: null,
  buildingTime: null,
});

const emptyReferencePreview = (): SetGoodPriceReferencePreview => ({
  officialPrice: null,
  lowestPrice: null,
  goodPrice: null,
  gobricksPriceCny: null,
  gobricksMatchPercent: null,
});

type Props = {
  draft: SetGoodPriceEditDraft;
  onClose: () => void;
  variant?: "create" | "inline";
  onViewPriceHistory?: (target: SetGoodPricePriceHistoryDialogTarget) => void;
};

export function SetGoodPriceEditForm({
  draft,
  onClose,
  variant = "inline",
  onViewPriceHistory,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [setNumInput, setSetNumInput] = useState("");
  const [newInput, setNewInput] = useState("");
  const [usedInput, setUsedInput] = useState("");
  const [officialInput, setOfficialInput] = useState("");

  const [referencePreview, setReferencePreview] = useState<SetGoodPriceReferencePreview>(
    emptyReferencePreview
  );
  const [bricktimeMeta, setBricktimeMeta] = useState<BricktimeSetMetaFields>(emptyBricktimeMeta);
  const [bricktimeFetchedAt, setBricktimeFetchedAt] = useState<string | null>(null);
  const [persistedBricktimeAt, setPersistedBricktimeAt] = useState<string | null>(null);
  const [gobricksComparedAt, setGobricksComparedAt] = useState<string | null>(null);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [salesStatusLoading, setSalesStatusLoading] = useState(false);
  const [gobricksLoading, setGobricksLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<BricktimePriceHistoryPoint[]>([]);

  const isEdit = draft.mode === "edit";
  const isCreate = variant === "create";
  const hasSaved = hasAnySetGoodPrice(draft.priceNewCny, draft.priceUsedCny);

  useEffect(() => {
    setSetNumInput(draft.setNum);
    setNewInput(priceToInput(draft.priceNewCny));
    setUsedInput(priceToInput(draft.priceUsedCny));
    const official = draft.bricktimeOfficialPrice?.trim() ?? "";
    setOfficialInput(official);
    setReferencePreview({
      officialPrice: official || null,
      lowestPrice: draft.bricktimeLowestPrice?.trim() || null,
      goodPrice: draft.bricktimeGoodPrice?.trim() || null,
      gobricksPriceCny: draft.gobricksPriceCny ?? null,
      gobricksMatchPercent: draft.gobricksMatchPercent ?? null,
    });
    const savedBricktimeAt = draft.bricktimeFetchedAt?.trim() || null;
    setBricktimeFetchedAt(savedBricktimeAt);
    setPersistedBricktimeAt(savedBricktimeAt);
    setGobricksComparedAt(draft.gobricksComparedAt?.trim() || null);
    setBricktimeMeta({
      launchDate: draft.bricktimeLaunchDate?.trim() || null,
      retiredDate: draft.bricktimeRetiredDate?.trim() || null,
      salesStatus: draft.bricktimeSalesStatus?.trim() || null,
      weight: draft.bricktimeWeight?.trim() || null,
      buildingTime: draft.bricktimeBuildingTime?.trim() || null,
    });
    setPriceHistory(draft.bricktimePriceHistory ?? []);
    setPreviewError(null);
    setError(null);
  }, [draft]);

  const canSave =
    setNumInput.trim().length > 0 &&
    (newInput.trim().length > 0 || usedInput.trim().length > 0);

  const canPreview = setNumInput.trim().length > 0 && !pending;

  const fetchOfficialPricePreview = () => {
    setPreviewError(null);
    setOfficialLoading(true);
    void previewSetGoodPriceOfficialPriceAction({ setNum: setNumInput }).then((res) => {
      setOfficialLoading(false);
      if (!res.ok) {
        setPreviewError(res.error);
        return;
      }
      setReferencePreview((prev) => ({
        ...prev,
        officialPrice: res.officialPrice,
      }));
      setOfficialInput(res.officialPrice ?? "");
      setBricktimeFetchedAt(new Date().toISOString());
    });
  };

  const fetchPriceHistoryPreview = () => {
    setPreviewError(null);
    setPriceHistoryLoading(true);
    void previewSetGoodPricePriceHistoryAction({ setNum: setNumInput }).then((res) => {
      setPriceHistoryLoading(false);
      if (!res.ok) {
        setPreviewError(res.error);
        return;
      }
      setReferencePreview((prev) => ({
        ...prev,
        lowestPrice: res.lowestPrice,
        goodPrice: res.goodPrice,
      }));
      setPriceHistory(res.priceHistory);
      setBricktimeFetchedAt(new Date().toISOString());
    });
  };

  const fetchSalesStatusPreview = () => {
    setPreviewError(null);
    setSalesStatusLoading(true);
    void previewSetGoodPriceSalesStatusAction({ setNum: setNumInput }).then((res) => {
      setSalesStatusLoading(false);
      if (!res.ok) {
        setPreviewError(res.error);
        return;
      }
      setBricktimeMeta((prev) => ({
        launchDate: res.launchDate ?? prev.launchDate,
        retiredDate: res.retiredDate ?? prev.retiredDate,
        salesStatus: res.salesStatus ?? prev.salesStatus,
        weight: res.weight ?? prev.weight,
        buildingTime: res.buildingTime ?? prev.buildingTime,
      }));
    });
  };

  const fetchGobricksPreview = () => {
    setPreviewError(null);
    setGobricksLoading(true);
    void previewSetGoodPriceGobricksCompareAction({ setNum: setNumInput }).then((res) => {
      setGobricksLoading(false);
      if (!res.ok) {
        setPreviewError(res.error);
        return;
      }
      setReferencePreview((prev) => ({
        ...prev,
        gobricksPriceCny: res.gobricksPriceCny,
        gobricksMatchPercent: res.gobricksMatchPercent,
      }));
      setGobricksComparedAt(new Date().toISOString());
    });
  };

  const save = () => {
    setError(null);
    const officialParsed = parseOptionalBricktimePriceInput(officialInput);
    if (officialParsed === undefined) {
      setError("官方原价格式无效，请输入数字或区间（如 599 或 400~500）。");
      return;
    }

    const bricktimeAt = bricktimeFetchedAt ?? persistedBricktimeAt;
    const shouldPersistBricktime =
      bricktimeAt != null ||
      officialParsed != null ||
      referencePreview.lowestPrice != null ||
      referencePreview.goodPrice != null ||
      bricktimeMeta.launchDate != null ||
      bricktimeMeta.retiredDate != null ||
      bricktimeMeta.salesStatus != null ||
      bricktimeMeta.weight != null ||
      bricktimeMeta.buildingTime != null;

    startTransition(async () => {
      const res = await saveSetGoodPriceAction({
        setNum: setNumInput,
        priceNewCny: newInput,
        priceUsedCny: usedInput,
        previewGobricks:
          referencePreview.gobricksPriceCny != null
            ? {
                gobricksPriceCny: referencePreview.gobricksPriceCny,
                gobricksMatchPercent: referencePreview.gobricksMatchPercent,
                gobricksComparedAt: gobricksComparedAt ?? undefined,
              }
            : undefined,
        previewBricktime: shouldPersistBricktime
          ? {
              officialPrice: officialParsed,
              goodPrice: referencePreview.goodPrice,
              lowestPrice: referencePreview.lowestPrice,
              bricktimeFetchedAt: bricktimeAt ?? new Date().toISOString(),
              launchDate: bricktimeMeta.launchDate,
              retiredDate: bricktimeMeta.retiredDate,
              salesStatus: bricktimeMeta.salesStatus,
              weight: bricktimeMeta.weight,
              buildingTime: bricktimeMeta.buildingTime,
              priceHistory,
            }
          : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const res = await clearSetGoodPriceAction({ setNum: setNumInput });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  const inputClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm text-[var(--text)] outline-none ring-[var(--accent)]/20 focus-visible:ring-2 w-full";

  const labelClass = "flex flex-col gap-1 text-sm min-w-0";

  const hasReferenceData =
    officialInput.trim().length > 0 ||
    referencePreview.lowestPrice != null ||
    referencePreview.goodPrice != null ||
    referencePreview.gobricksPriceCny != null ||
    bricktimeMeta.launchDate != null ||
    bricktimeMeta.retiredDate != null ||
    bricktimeMeta.salesStatus != null ||
    bricktimeMeta.weight != null ||
    bricktimeMeta.buildingTime != null;
  const hideSalesStatusPreview = isBricktimeRetiredSalesStatus(bricktimeMeta.salesStatus);
  const hideOfficialPreview = parseOptionalBricktimePriceInput(officialInput) != null;
  const hidePriceHistoryPreview = hasBricktimePriceHistoryForCurrentMonth(priceHistory);
  const hideGobricksPreview =
    typeof referencePreview.gobricksPriceCny === "number" &&
    Number.isFinite(referencePreview.gobricksPriceCny);

  const syncOfficialInput = (value: string) => {
    setOfficialInput(value);
    setReferencePreview((prev) => ({
      ...prev,
      officialPrice: value.trim() || null,
    }));
  };

  return (
    <div
      className={
        isCreate
          ? "flex flex-col gap-3 rounded-md border border-[var(--accent)]/30 bg-[var(--surface-2)]/40 p-3 sm:gap-4 sm:p-4 result-card"
          : "flex flex-col gap-3 sm:gap-4"
      }
    >
      {isCreate ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">添加好价</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              套装编号可只填数字部分；至少填写全新或二手价格之一。
            </p>
          </div>
          <button type="button" className={goodPriceBtnSecondary} onClick={onClose}>
            取消
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!isEdit ? (
          <label className={`${labelClass} sm:col-span-2 lg:col-span-4`}>
            <span className="text-[var(--muted)]">套装编号 set_num</span>
            <input
              type="text"
              value={setNumInput}
              onChange={(e) => {
                setSetNumInput(e.target.value);
                syncOfficialInput("");
                setReferencePreview(emptyReferencePreview());
                setBricktimeMeta(emptyBricktimeMeta());
                setBricktimeFetchedAt(null);
                setPersistedBricktimeAt(null);
                setGobricksComparedAt(null);
                setPreviewError(null);
              }}
              disabled={pending}
              placeholder="例如 71821 或 71821-1"
              className={inputClass}
            />
          </label>
        ) : null}

        <label className={labelClass}>
          <span className="text-[var(--muted)]">官方原价（元）</span>
          <input
            type="text"
            inputMode="decimal"
            value={officialInput}
            onChange={(e) => syncOfficialInput(e.target.value)}
            placeholder="手动填写或查官方价"
            disabled={pending}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          <span className="text-[var(--muted)]">全新价格（元）</span>
          <input
            type="text"
            inputMode="decimal"
            value={newInput}
            onChange={(e) => setNewInput(e.target.value)}
            placeholder="选填"
            disabled={pending}
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          <span className="text-[var(--muted)]">二手价格（元）</span>
          <input
            type="text"
            inputMode="decimal"
            value={usedInput}
            onChange={(e) => setUsedInput(e.target.value)}
            placeholder="选填"
            disabled={pending}
            className={inputClass}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--surface)]/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-[var(--text)]">参考价对比</p>
          <div className="flex flex-wrap gap-2">
            {hideOfficialPreview ? null : (
              <button
                type="button"
                onClick={fetchOfficialPricePreview}
                disabled={
                  !canPreview ||
                  officialLoading ||
                  priceHistoryLoading ||
                  salesStatusLoading ||
                  gobricksLoading
                }
                className={goodPriceBtnSecondary}
                title="只调用 Bricktime /sets/{id}，读取官方原价"
              >
                {officialLoading ? "查询中…" : "查官方价"}
              </button>
            )}
            {hidePriceHistoryPreview ? null : (
              <button
                type="button"
                onClick={fetchPriceHistoryPreview}
                disabled={
                  !canPreview ||
                  officialLoading ||
                  priceHistoryLoading ||
                  salesStatusLoading ||
                  gobricksLoading
                }
                className={goodPriceBtnSecondary}
                title="只调用 Bricktime /sets/{id}/prices_history，读取价格历史"
              >
                {priceHistoryLoading ? "查询中…" : "查价格历史"}
              </button>
            )}
            {hideSalesStatusPreview ? null : (
              <button
                type="button"
                onClick={fetchSalesStatusPreview}
                disabled={
                  !canPreview ||
                  officialLoading ||
                  priceHistoryLoading ||
                  salesStatusLoading ||
                  gobricksLoading
                }
                className={goodPriceBtnSecondary}
                title="只调用 Bricktime /sets/{id}，读取销售状态与元数据"
              >
                {salesStatusLoading ? "查询中…" : "查销售状态"}
              </button>
            )}
            {hideGobricksPreview ? null : (
              <button
                type="button"
                onClick={fetchGobricksPreview}
                disabled={
                  !canPreview ||
                  officialLoading ||
                  priceHistoryLoading ||
                  salesStatusLoading ||
                  gobricksLoading
                }
                className={goodPriceBtnSecondary}
              >
                {gobricksLoading ? "比价中…" : "高砖比价"}
              </button>
            )}
          </div>
        </div>
        {previewError ? <p className="text-xs text-red-400">{previewError}</p> : null}
        {hasReferenceData ? (
          <>
            <SetGoodPriceReferencePanel
              preview={referencePreview}
              priceHistory={priceHistory}
              onViewPriceHistory={
                priceHistory.length > 0 && onViewPriceHistory
                  ? () =>
                      onViewPriceHistory({
                        setNum: setNumInput.trim(),
                        title: draft.catalogName?.trim() || setNumInput.trim(),
                        officialPrice: officialInput.trim() || referencePreview.officialPrice,
                        priceHistory,
                      })
                  : undefined
              }
            />
            <SetGoodPriceBricktimeMetaLine meta={bricktimeMeta} />
            <SetGoodPriceTimestampsLine
              bricktimeFetchedAt={bricktimeFetchedAt}
              gobricksComparedAt={gobricksComparedAt}
            />
          </>
        ) : (
          <p className="text-xs text-[var(--muted-2)]">
            {isCreate
              ? hideOfficialPreview
                ? "已获取官方原价，可继续录入入手价或按需查询价格历史、销售状态、高砖比价。"
                : "填写套装编号后，点击「查官方价」获取参考价；也可按需查询价格历史、销售状态、高砖比价。"
              : hideOfficialPreview
                ? "可修改官方原价，或按需查询价格历史、销售状态、高砖比价。"
                : "可手动录入官方原价，或按需单独查询官方价、价格历史、销售状态、高砖比价。"}
          </p>
        )}
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        {!isCreate ? (
          <button type="button" onClick={onClose} disabled={pending} className={goodPriceBtnSecondary}>
            取消
          </button>
        ) : null}
        {isEdit && hasSaved ? (
          <button type="button" onClick={remove} disabled={pending} className={goodPriceBtnDanger}>
            删除
          </button>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={pending || !canSave || (isCreate && officialLoading)}
          className={goodPriceBtnPrimary}
        >
          {pending ? "保存中…" : "保存"}
        </button>
      </div>
    </div>
  );
}
