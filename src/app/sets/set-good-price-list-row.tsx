import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import { SetGoodPriceHeatBadge } from "@/app/sets/set-good-price-heat-badge";
import { SetGoodPriceReferencePanel } from "@/app/sets/set-good-price-reference-panel";
import { SetGoodPriceTimestampsLine } from "@/app/sets/set-good-price-timestamps-line";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { goodPriceRowActionsClass } from "@/lib/set-good-price-buttons";
import {
  formatDiscountVsOfficialPrice,
  formatSetGoodPriceCny,
  formatSetGoodPricePerPiece,
} from "@/lib/set-good-price-format";
import { computeSetGoodPriceHeat } from "@/lib/set-good-price-heat";
import type { SetGoodPriceSortKind } from "@/lib/set-good-price-list-sort";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function MetaDot() {
  return <span className="text-[var(--muted-2)]" aria-hidden>
    ·
  </span>;
}

/** 标题下方：编号、年份、片数 */
function SetCatalogMetaLine({
  setNum,
  year,
  numParts,
  onPartsClick,
}: {
  setNum: string;
  year: number | null;
  numParts: number | null;
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

function PriceColumn({
  label,
  priceCny,
  officialPrice,
  numParts,
  highlighted,
}: {
  label: string;
  priceCny: number | null;
  officialPrice?: string | null;
  numParts: number | null;
  highlighted?: boolean;
}) {
  const priceLabel = formatSetGoodPriceCny(priceCny);
  const discountLabel =
    priceCny != null ? formatDiscountVsOfficialPrice(priceCny, officialPrice) : null;
  const perPieceLabel =
    priceCny != null ? formatSetGoodPricePerPiece(priceCny, numParts) : null;

  return (
    <div
      className={`flex h-full min-w-0 flex-col rounded-md border px-2.5 py-2 sm:px-3 ${
        highlighted
          ? "border-[var(--accent)]/35 bg-[var(--accent-soft)]/40"
          : "border-[var(--border-soft)] bg-[var(--surface-2)]/40"
      }`}
    >
      <p className="text-[11px] font-medium text-[var(--muted)]">{label}</p>
      {priceLabel ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums text-amber-200/95 sm:text-base">
            {priceLabel}
          </span>
          {discountLabel ? (
            <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-emerald-400/90">
              {discountLabel}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 font-mono text-sm text-[var(--muted-2)]">—</p>
      )}
      {perPieceLabel ? (
        <p className="mt-1.5 font-mono text-[11px] tabular-nums text-[var(--muted)]">
          {perPieceLabel}
        </p>
      ) : priceLabel ? (
        <p className="mt-1.5 text-[11px] text-[var(--muted-2)]">无片数</p>
      ) : null}
    </div>
  );
}

export function SetGoodPriceListRow({
  setNum,
  title,
  coverUrl,
  priceNewCny,
  priceUsedCny,
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
  sortKind,
  actions,
  onPartsClick,
  isEditing,
  editForm,
}: {
  setNum: string;
  title: string;
  coverUrl: string | null;
  priceNewCny: number | null;
  priceUsedCny: number | null;
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
  sortKind?: SetGoodPriceSortKind;
  actions?: ReactNode;
  onPartsClick?: () => void;
  isEditing?: boolean;
  editForm?: ReactNode;
}) {
  const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, setNum);
  const heat = computeSetGoodPriceHeat({
    priceNewCny,
    priceUsedCny,
    bricktimeLowestPrice,
    bricktimeGoodPrice,
    gobricksPriceCny,
  });

  return (
    <li
      className={`result-card overflow-hidden p-0 ${isEditing ? "ring-1 ring-[var(--accent)]/35" : ""}`}
    >
      <div className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] items-stretch gap-3 p-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4 sm:p-3.5 lg:grid-cols-[8.5rem_minmax(0,1fr)]">
        <Link
          href={detailHref}
          className="media-box relative block min-h-[4.75rem] w-full self-stretch overflow-hidden rounded-lg"
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

        <div className="flex min-w-0 flex-col gap-2 sm:gap-2.5">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1.5 sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <Link
                  href={detailHref}
                  className="line-clamp-2 min-w-0 text-sm font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline sm:text-base"
                >
                  {title}
                </Link>
                {heat.level > 0 ? <SetGoodPriceHeatBadge breakdown={heat} /> : null}
              </div>
              <SetCatalogMetaLine
                setNum={setNum}
                year={year}
                numParts={numParts}
                onPartsClick={onPartsClick}
              />
            </div>
            {actions ? <div className={goodPriceRowActionsClass}>{actions}</div> : null}
          </div>

          {isEditing && editForm ? (
            editForm
          ) : (
            <>
              <div className="grid w-full grid-cols-2 gap-2 sm:gap-3">
                <PriceColumn
                  label="全新"
                  priceCny={priceNewCny}
                  officialPrice={bricktimeOfficialPrice}
                  numParts={numParts}
                  highlighted={sortKind === "new"}
                />
                <PriceColumn
                  label="二手"
                  priceCny={priceUsedCny}
                  officialPrice={bricktimeOfficialPrice}
                  numParts={numParts}
                  highlighted={sortKind === "used"}
                />
              </div>

              <SetGoodPriceReferencePanel
                preview={{
                  officialPrice: bricktimeOfficialPrice ?? null,
                  lowestPrice: bricktimeLowestPrice ?? null,
                  goodPrice: bricktimeGoodPrice ?? null,
                  gobricksPriceCny: gobricksPriceCny ?? null,
                  gobricksMatchPercent: gobricksMatchPercent ?? null,
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
