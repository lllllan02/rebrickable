import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import { SetGoodPriceHeatBadge } from "@/app/sets/set-good-price-heat-badge";
import { SetGoodPriceBricktimeMetaLine } from "@/app/sets/set-good-price-bricktime-meta-line";
import { SetGoodPriceReferencePanel } from "@/app/sets/set-good-price-reference-panel";
import { SetGoodPriceTimestampsLine } from "@/app/sets/set-good-price-timestamps-line";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { goodPriceRowActionsClass } from "@/lib/set-good-price-buttons";
import {
  formatDiscountVsOfficialPrice,
  formatBricktimeSalesStatusBrief,
  formatBricktimeSalesStatusFetchedLabel,
  formatSetGoodPriceCny,
  formatSetGoodPricePerPiece,
} from "@/lib/set-good-price-format";
import { computeSetGoodPriceHeat } from "@/lib/set-good-price-heat";
import type { BuildWorkflowStage } from "@/lib/build-workflow-stage";
import { parseBricktimePriceHistoryJson } from "@/lib/bricktime-price-history";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function MetaDot() {
  return <span className="text-[var(--muted-2)]" aria-hidden>
    ·
  </span>;
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

/** 标题下方：编号、年份、片数、单价、销售状态 */
function SetCatalogMetaLine({
  setNum,
  year,
  numParts,
  perPieceLabel,
  salesStatus,
  salesStatusFetchedAt,
  onPartsClick,
}: {
  setNum: string;
  year: number | null;
  numParts: number | null;
  perPieceLabel?: string | null;
  salesStatus?: string | null;
  salesStatusFetchedAt?: string | null;
  onPartsClick?: () => void;
}) {
  const items: ReactNode[] = [
    <span key="set" className="font-mono text-[var(--muted)]" title={setNum}>
      {setNum}
    </span>,
  ];

  if (year != null) {
    items.push(
      <span key="year" className="text-[var(--muted-2)]">
        {year}
      </span>
    );
  }
  if (typeof numParts === "number" && numParts > 0) {
    const partsLabel = `${numParts.toLocaleString("zh-CN")} 片`;
    items.push(
      onPartsClick ? (
        <button
          key="parts"
          type="button"
          onClick={onPartsClick}
          className="tabular-nums text-[var(--accent)] underline-offset-2 hover:underline"
          title="查看官方 BOM 零件清单"
        >
          {partsLabel}
        </button>
      ) : (
        <span key="parts" className="tabular-nums text-[var(--muted-2)]">
          {partsLabel}
        </span>
      )
    );
  }

  if (perPieceLabel) {
    items.push(
      <span key="per-piece" className="font-mono tabular-nums text-[var(--muted-2)]">
        {perPieceLabel}
      </span>
    );
  }

  const salesBrief = formatBricktimeSalesStatusBrief(salesStatus);
  if (salesBrief) {
    const retired = salesBrief === "绝版";
    const queryLabel =
      !retired ? formatBricktimeSalesStatusFetchedLabel(salesStatusFetchedAt) : null;
    const statusTitle = [salesStatus?.trim(), queryLabel ? `查询于 ${queryLabel}` : null]
      .filter(Boolean)
      .join(" · ");
    items.push(
      <span
        key="sales"
        title={statusTitle || undefined}
        className={retired ? "font-medium text-red-400/95" : "text-[var(--muted-2)]"}
      >
        {salesBrief}
        {queryLabel ? (
          <span className="ml-0.5 font-mono tabular-nums text-[var(--muted-2)]/80">
            ·{queryLabel}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs">
      {items.map((node, i) => (
        <Fragment key={i}>
          {i > 0 ? <MetaDot /> : null}
          {node}
        </Fragment>
      ))}
    </p>
  );
}

export function SetGoodPriceListRow({
  setNum,
  title,
  coverUrl,
  priceNewCny,
  updatedAtIso,
  numParts,
  year,
  gobricksPriceCny,
  gobricksMatchPercent,
  gobricksComparedAt,
  bricktimeOfficialPrice,
  bricktimeGoodPrice,
  bricktimeLowestPrice,
  bricktimeRecentLowPrice,
  bricktimeFetchedAt,
  bricktimeLaunchDate,
  bricktimeRetiredDate,
  bricktimeSalesStatus,
  bricktimeSalesStatusFetchedAt,
  bricktimeWeight,
  bricktimeBuildingTime,
  bricktimePriceHistory,
  workflowStage,
  markWantedDisabled,
  actions,
  onPartsClick,
  onViewPriceHistory,
  onMarkWanted,
  isEditing,
  editForm,
}: {
  setNum: string;
  title: string;
  coverUrl: string | null;
  priceNewCny: number | null;
  updatedAtIso: string;
  numParts: number | null;
  year: number | null;
  gobricksPriceCny?: number | null;
  gobricksMatchPercent?: number | null;
  gobricksComparedAt?: string | null;
  bricktimeOfficialPrice?: string | null;
  bricktimeGoodPrice?: string | null;
  bricktimeLowestPrice?: string | null;
  bricktimeRecentLowPrice?: string | null;
  bricktimeFetchedAt?: string | null;
  bricktimeLaunchDate?: string | null;
  bricktimeRetiredDate?: string | null;
  bricktimeSalesStatus?: string | null;
  bricktimeSalesStatusFetchedAt?: string | null;
  bricktimeWeight?: string | null;
  bricktimeBuildingTime?: string | null;
  bricktimePriceHistory?: string | null;
  workflowStage?: BuildWorkflowStage | null;
  markWantedDisabled?: boolean;
  actions?: ReactNode;
  onPartsClick?: () => void;
  onViewPriceHistory?: () => void;
  onMarkWanted?: () => void;
  isEditing?: boolean;
  editForm?: ReactNode;
}) {
  const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, setNum);
  const isWanted = workflowStage === "replicate";
  const isOwned = workflowStage === "complete" || workflowStage === "purchase";
  const parsedPriceHistory = parseBricktimePriceHistoryJson(bricktimePriceHistory);
  const heat = computeSetGoodPriceHeat({
    priceNewCny,
    bricktimeLowestPrice,
    bricktimeGoodPrice,
    gobricksPriceCny,
  });
  const priceLabel = formatSetGoodPriceCny(priceNewCny);
  const discountLabel =
    priceNewCny != null
      ? formatDiscountVsOfficialPrice(priceNewCny, bricktimeOfficialPrice)
      : null;
  const perPieceLabel =
    priceNewCny != null ? formatSetGoodPricePerPiece(priceNewCny, numParts) : null;

  return (
    <li
      className={`result-card overflow-hidden p-0 ${isEditing ? "ring-1 ring-[var(--accent)]/35" : ""}`}
    >
      <div className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] items-stretch gap-3 p-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4 sm:p-3.5 lg:grid-cols-[8.5rem_minmax(0,1fr)]">
        <div className="media-box relative min-h-[4.75rem] w-full self-stretch overflow-hidden rounded-lg">
          <Link
            href={detailHref}
            className="block min-h-[4.75rem] w-full"
            aria-label={`${title} 封面`}
          >
            {usableImgUrl(coverUrl) ? (
              <RemoteCoverImage
                src={coverUrl.trim()}
                fill
                className="object-contain p-1.5 sm:p-2"
                sizes="(max-width: 640px) 104px, 152px"
                alt=""
                fallbackLabel="无"
              />
            ) : (
              <span className="flex min-h-[4.75rem] w-full items-center justify-center text-xs text-[var(--muted)]">
                无图
              </span>
            )}
          </Link>
          {onMarkWanted ? (
            <button
              type="button"
              onClick={onMarkWanted}
              disabled={markWantedDisabled || isOwned}
              className={`absolute right-1.5 top-1.5 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-1 ring-black/15 transition-colors ${
                isWanted
                  ? "bg-red-500 text-white hover:bg-black/55"
                  : isOwned
                    ? "bg-[var(--accent)] text-[#141414]"
                    : "bg-black/55 text-white hover:bg-red-500"
              } disabled:cursor-default disabled:opacity-95`}
              title={isOwned ? "已拥有" : isWanted ? "取消心动" : "标记心动"}
              aria-label={
                isOwned
                  ? `${title} 已拥有`
                  : isWanted
                    ? `${title} 取消心动`
                    : `${title} 标记心动`
              }
            >
              <HeartIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:gap-2.5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1.5 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <Link
                  href={detailHref}
                  className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline sm:text-base"
                >
                  {title}
                </Link>
                {priceLabel ? (
                  <span className="inline-flex shrink-0 flex-wrap items-baseline gap-x-1.5">
                    <span className="font-mono text-sm font-semibold tabular-nums text-amber-200/95 sm:text-base">
                      {priceLabel}
                    </span>
                    {discountLabel ? (
                      <span className="font-mono text-[11px] font-medium tabular-nums text-emerald-400/90">
                        {discountLabel}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {heat.level > 0 ? <SetGoodPriceHeatBadge breakdown={heat} /> : null}
              </div>
              <SetCatalogMetaLine
                setNum={setNum}
                year={year}
                numParts={numParts}
                perPieceLabel={perPieceLabel}
                salesStatus={bricktimeSalesStatus}
                salesStatusFetchedAt={bricktimeSalesStatusFetchedAt}
                onPartsClick={onPartsClick}
              />
            </div>
            {actions ? <div className={goodPriceRowActionsClass}>{actions}</div> : null}
          </div>

          {isEditing && editForm ? (
            editForm
          ) : (
            <>
              <SetGoodPriceReferencePanel
                preview={{
                  officialPrice: bricktimeOfficialPrice ?? null,
                  lowestPrice: bricktimeLowestPrice ?? null,
                  goodPrice: bricktimeGoodPrice ?? null,
                  gobricksPriceCny: gobricksPriceCny ?? null,
                  gobricksMatchPercent: gobricksMatchPercent ?? null,
                }}
                priceHistory={parsedPriceHistory}
                onViewPriceHistory={
                  parsedPriceHistory.length > 0 ? onViewPriceHistory : undefined
                }
              />

              <SetGoodPriceBricktimeMetaLine
                meta={{
                  launchDate: bricktimeLaunchDate,
                  retiredDate: bricktimeRetiredDate,
                  weight: bricktimeWeight,
                  buildingTime: bricktimeBuildingTime,
                }}
              />

              <SetGoodPriceTimestampsLine
                priceUpdatedAt={updatedAtIso}
                bricktimeFetchedAt={bricktimeFetchedAt}
                gobricksComparedAt={gobricksComparedAt}
              />
            </>
          )}
        </div>
      </div>
    </li>
  );
}
