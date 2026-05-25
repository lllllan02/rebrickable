import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { goodPriceRowActionsClass } from "@/lib/set-good-price-buttons";
import {
  formatGobricksMatchPercent,
  formatSetGoodPriceCny,
  formatSetGoodPricePerPiece,
  formatSetGoodPricePerStudUnit,
  formatStudVolumeCoverageRatio,
} from "@/lib/set-good-price-format";
import type { SetGoodPriceSortKind } from "@/lib/set-good-price-list-sort";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function MetaDot() {
  return <span className="text-[var(--muted-2)]" aria-hidden>
    ·
  </span>;
}

/** 标题下方：编号、年份、片数、占地单位、可统计占比 */
function SetCatalogMetaLine({
  setNum,
  year,
  numParts,
  totalStudUnits,
  studCoverageRatio,
}: {
  setNum: string;
  year: number | null;
  numParts: number | null;
  totalStudUnits: number | null;
  studCoverageRatio: number | null;
}) {
  const coverageLabel = formatStudVolumeCoverageRatio(studCoverageRatio);
  const hasStudUnits =
    typeof totalStudUnits === "number" &&
    Number.isFinite(totalStudUnits) &&
    totalStudUnits > 0;
  const hasBomHint = studCoverageRatio != null || hasStudUnits;

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
    items.push(
      <span key="parts" className="tabular-nums text-[var(--muted-2)]">
        {numParts.toLocaleString("zh-CN")} 片
      </span>
    );
  }
  if (hasStudUnits) {
    items.push(
      <span key="units" className="tabular-nums text-[var(--muted-2)]">
        {totalStudUnits!.toLocaleString("zh-CN")} 占地单位
      </span>
    );
  }
  if (coverageLabel) {
    items.push(
      <span
        key="cov"
        className="tabular-nums text-[var(--muted-2)]"
        title="名称可解析长×宽的 BOM 主件颗数占比；其余主件按 1 单位/颗计入占地"
      >
        可统计 {coverageLabel}
      </span>
    );
  } else if (hasBomHint && !hasStudUnits) {
    items.push(
      <span key="nodata" className="text-[var(--muted-2)]">
        占地数据不足
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

function UnitPriceRow({
  perPieceLabel,
  perStudLabel,
  showNoPartsHint,
}: {
  perPieceLabel: string | null;
  perStudLabel: string | null;
  showNoPartsHint?: boolean;
}) {
  if (!perPieceLabel && !perStudLabel && !showNoPartsHint) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      {perPieceLabel ? (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--muted)]">
          {perPieceLabel}
        </span>
      ) : showNoPartsHint ? (
        <span className="text-[11px] text-[var(--muted-2)]">无片数</span>
      ) : null}
      {perStudLabel ? (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--muted)]">
          {perStudLabel}
        </span>
      ) : null}
    </div>
  );
}

function PriceColumn({
  label,
  priceCny,
  numParts,
  totalStudUnits,
  highlighted,
}: {
  label: string;
  priceCny: number | null;
  numParts: number | null;
  totalStudUnits: number | null;
  highlighted?: boolean;
}) {
  const priceLabel = formatSetGoodPriceCny(priceCny);
  const perPieceLabel =
    priceCny != null ? formatSetGoodPricePerPiece(priceCny, numParts) : null;
  const perStudLabel =
    priceCny != null ? formatSetGoodPricePerStudUnit(priceCny, totalStudUnits) : null;

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
        <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-amber-200/95 sm:text-base">
          {priceLabel}
        </p>
      ) : (
        <p className="mt-1 font-mono text-sm text-[var(--muted-2)]">—</p>
      )}
      <UnitPriceRow
        perPieceLabel={perPieceLabel}
        perStudLabel={perStudLabel}
        showNoPartsHint={Boolean(priceLabel && !perPieceLabel && !perStudLabel)}
      />
    </div>
  );
}

function GobricksCompareLine({
  gobricksPriceCny,
  gobricksMatchPercent,
  gobricksComparedAt,
}: {
  gobricksPriceCny: number | null;
  gobricksMatchPercent: number | null;
  gobricksComparedAt: string | null;
}) {
  const priceLabel = formatSetGoodPriceCny(gobricksPriceCny);
  const matchLabel = formatGobricksMatchPercent(gobricksMatchPercent);
  if (!priceLabel && !matchLabel) return null;

  const comparedHint =
    typeof gobricksComparedAt === "string" && gobricksComparedAt.trim()
      ? gobricksComparedAt.trim().slice(0, 19).replace("T", " ")
      : null;

  return (
    <div
      className="rounded-md border border-sky-500/25 bg-sky-500/5 px-2.5 py-2"
      title="官方 BOM 对照高砖：颜色未匹配也计入总价，仅「零件未匹配」不计价"
    >
      <p className="text-[11px] font-medium text-sky-200/90">高砖比价</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        {priceLabel ? (
          <span className="font-mono text-sm font-semibold tabular-nums text-sky-100/95">
            {priceLabel}
          </span>
        ) : null}
        {matchLabel ? (
          <span className="font-mono text-[11px] tabular-nums text-[var(--muted)]">
            匹配 {matchLabel}
          </span>
        ) : null}
      </div>
      {comparedHint ? (
        <p className="mt-1 text-[11px] tabular-nums text-[var(--muted-2)]">
          比价 <time dateTime={gobricksComparedAt!}>{comparedHint}</time>
        </p>
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
  totalStudUnits,
  studCoverageRatio,
  year,
  gobricksPriceCny,
  gobricksMatchPercent,
  gobricksComparedAt,
  sortKind,
  actions,
}: {
  setNum: string;
  title: string;
  coverUrl: string | null;
  priceNewCny: number | null;
  priceUsedCny: number | null;
  updatedAtIso: string;
  numParts: number | null;
  totalStudUnits: number | null;
  studCoverageRatio: number | null;
  year: number | null;
  gobricksPriceCny?: number | null;
  gobricksMatchPercent?: number | null;
  gobricksComparedAt?: string | null;
  sortKind?: SetGoodPriceSortKind;
  actions?: ReactNode;
}) {
  const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, setNum);
  const savedAt = updatedAtIso.slice(0, 19).replace("T", " ");
  const hasGobricks =
    gobricksPriceCny != null ||
    gobricksMatchPercent != null ||
    (typeof gobricksComparedAt === "string" && gobricksComparedAt.trim().length > 0);

  return (
    <li className="result-card overflow-hidden p-0">
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
              <Link
                href={detailHref}
                className="line-clamp-2 text-sm font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline sm:text-base"
              >
                {title}
              </Link>
              <SetCatalogMetaLine
                setNum={setNum}
                year={year}
                numParts={numParts}
                totalStudUnits={totalStudUnits}
                studCoverageRatio={studCoverageRatio}
              />
            </div>
            {actions ? <div className={goodPriceRowActionsClass}>{actions}</div> : null}
          </div>

          <div className="grid w-full grid-cols-2 gap-2 sm:gap-3">
            <PriceColumn
              label="全新"
              priceCny={priceNewCny}
              numParts={numParts}
              totalStudUnits={totalStudUnits}
              highlighted={sortKind === "new"}
            />
            <PriceColumn
              label="二手"
              priceCny={priceUsedCny}
              numParts={numParts}
              totalStudUnits={totalStudUnits}
              highlighted={sortKind === "used"}
            />
          </div>

          {hasGobricks ? (
            <GobricksCompareLine
              gobricksPriceCny={gobricksPriceCny ?? null}
              gobricksMatchPercent={gobricksMatchPercent ?? null}
              gobricksComparedAt={gobricksComparedAt ?? null}
            />
          ) : null}

          <p className="text-[11px] tabular-nums text-[var(--muted-2)]">
            更新 <time dateTime={updatedAtIso}>{savedAt}</time>
          </p>
        </div>
      </div>
    </li>
  );
}
