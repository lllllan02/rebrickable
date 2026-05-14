"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { PARTS_SHEET_TAG_LABELS, PARTS_SHEET_TAG_ORDER } from "@/lib/parts-sheet-tags";
import {
  getSheetFilterOptionsFromItems,
  rowMatchesSheetListFilter,
  type SheetListFilter,
} from "@/lib/parts-sheet-list-filter";
import {
  getShortageReasonFilterOptionsFromRests,
  rowMatchesShortageReasonFilter,
  shortageReasonCategoriesInRest,
  SHORTAGE_REASON_CATEGORY_DEFS,
  type ShortageReasonFilterId,
} from "@/lib/shortage-reason-filter";
import { PART_GRID_TILE_CLASS_BASE, PART_GRID_TILE_OWNED_HIGHLIGHT } from "@/lib/part-grid-tile-classes";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";
import { RemoteCoverImage } from "@/components/remote-cover-image";

import {
  getPartSubstituteSuggestionsAction,
  type PartSubstituteSuggestion,
} from "@/app/mocs/part-substitute-suggestions-action";

function substituteRelBadgeLabel(t: "A" | "M"): string {
  return t === "A" ? "替代" : "模具";
}

function shortageReasonSummaryLines(rest: string): string[] {
  const ids = shortageReasonCategoriesInRest(rest);
  if (ids.length === 0) return [];
  const labelById = new Map(SHORTAGE_REASON_CATEGORY_DEFS.map((d) => [d.id, d.label]));
  return ids.map((id) => labelById.get(id) ?? id);
}

/** 配货 / 缺件列表：优先高砖商品图，否则乐高目录图 */
function sheetRowListThumbSrc(r: ShortageResolveItem, preferGdsThumb: boolean): string | null {
  const gds = r.gdsPicture?.trim() || null;
  if (preferGdsThumb && gds) return gds;
  return r.imgUrl?.trim() || null;
}

function rowHasGobricksDetailFields(item: ShortageResolveItem): boolean {
  return Boolean(
    item.gdsItemId?.trim() ||
      item.gdsPicture?.trim() ||
      item.gdsColorId?.trim() ||
      item.gdsCaption?.trim() ||
      item.gdsCaptionEn?.trim() ||
      item.gdsUnitPrice?.trim() ||
      item.gobricksUnitPrice?.trim() ||
      item.gdsShelfState?.trim() ||
      item.gdsLegoColorId?.trim()
  );
}

function CatalogImageFigure({
  label,
  imageUrl,
  sizes,
}: {
  label: string;
  imageUrl: string;
  sizes: string;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[inset_0_1px_0_rgba(0,0,0,0.06)]">
      <figcaption className="px-3 pb-0 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">
        {label}
      </figcaption>
      <div className="relative mx-auto aspect-square w-full max-w-[18rem] min-h-[10rem]">
        <RemoteCoverImage
          src={imageUrl}
          fill
          className="object-contain p-3 sm:p-4"
          sizes={sizes}
          fallbackLabel="无图"
        />
      </div>
    </figure>
  );
}

function GobricksDetailSection({
  item,
  showHeading = true,
}: {
  item: ShortageResolveItem;
  /** 为 false 时由外层栏目标题代替 */
  showHeading?: boolean;
}) {
  const unit =
    item.gdsUnitPrice?.trim() || item.gobricksUnitPrice?.trim() || null;
  return (
    <section>
      {showHeading ? (
        <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-2)]">
          高砖商城
        </h3>
      ) : null}
      <dl className="space-y-3.5 text-sm sm:text-[15px] sm:leading-relaxed">
        {item.gdsItemId?.trim() ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">商品 ID</dt>
            <dd className="mt-0.5 break-all font-mono text-[var(--text)]">{item.gdsItemId.trim()}</dd>
          </div>
        ) : null}
        {item.gdsCaption?.trim() ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">商品名（中文）</dt>
            <dd className="mt-0.5 text-[var(--text)]">{item.gdsCaption.trim()}</dd>
          </div>
        ) : null}
        {item.gdsCaptionEn?.trim() ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">商品名（英文）</dt>
            <dd className="mt-0.5 text-[var(--text)]">{item.gdsCaptionEn.trim()}</dd>
          </div>
        ) : null}
        {item.gdsColorId?.trim() ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">高砖颜色 ID</dt>
            <dd className="mt-0.5 font-mono text-[var(--text)]">{item.gdsColorId.trim()}</dd>
          </div>
        ) : null}
        {item.gdsLegoColorId?.trim() ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">接口乐高色 ID</dt>
            <dd className="mt-0.5 font-mono text-[var(--text)]">{item.gdsLegoColorId.trim()}</dd>
          </div>
        ) : null}
        {unit ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">单价（元）</dt>
            <dd className="mt-0.5 text-[var(--text)]">{unit}</dd>
          </div>
        ) : null}
        {item.gdsShelfState?.trim() ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">上架状态</dt>
            <dd className="mt-0.5 font-mono text-xs text-[var(--text)]">{item.gdsShelfState.trim()}</dd>
          </div>
        ) : null}
        {item.gdsPicture?.trim() ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">商品图 URL</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-[var(--muted)]">{item.gdsPicture.trim()}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

type LegoCatalogDetailBlockProps = {
  item: ShortageResolveItem;
  titleId: string;
  heroTitle: string;
  showNameRowInDl: boolean;
  reasonLines: string[];
  showShortageReasonSummary: boolean;
  parentSubjectOwned: boolean;
  onClose: () => void;
};

function LegoCatalogDetailBlock({
  item,
  titleId,
  heroTitle,
  showNameRowInDl,
  reasonLines,
  showShortageReasonSummary,
  parentSubjectOwned,
  onClose,
}: LegoCatalogDetailBlockProps) {
  return (
    <>
      <div className="border-b border-[var(--border-soft)] pb-5 sm:pb-6">
        <h2
          id={titleId}
          className="text-lg font-semibold leading-snug text-[var(--accent)] sm:text-xl sm:leading-snug"
        >
          {heroTitle}
        </h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm leading-relaxed text-[var(--muted)]">
          <span className="font-mono text-[13px] font-medium text-[var(--text)]">{item.partNum}</span>
          {item.partCatName ? <span>· {item.partCatName}</span> : null}
          <span className="text-[var(--muted-2)]">
            · 第 {item.lineNumber} 行 · 数量 {item.quantity}
          </span>
        </p>
        {item.partFound ? (
          <p className="mt-3">
            <Link
              href={`/parts/${encodeURIComponent(item.partNum)}`}
              className="text-sm font-medium text-[var(--accent)] no-underline hover:underline"
              onClick={onClose}
            >
              查看完整零件页 →
            </Link>
          </p>
        ) : null}
      </div>

      <dl className="mt-5 space-y-3.5 text-sm sm:mt-6 sm:text-[15px] sm:leading-relaxed">
        {showNameRowInDl ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">名称</dt>
            <dd className="mt-0.5 text-[var(--text)]">
              {item.partFound && item.partName
                ? item.partName
                : item.partFound
                  ? "（无名称）"
                  : "本地库中无此 part_num"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">颜色</dt>
          <dd className="mt-0.5 text-[var(--text)]">
            {item.colorName ? `${item.colorName}（${item.colorId}）` : `色 ID ${item.colorId}`}
          </dd>
        </div>
        {item.imgSource === "part" ? (
          <p className="text-xs text-[var(--muted)]">当前颜色无库存图，已使用该零件其他颜色的图片。</p>
        ) : null}
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">元素</dt>
          <dd className="mt-0.5 text-[var(--text)]">{item.elementKnown ? "已知" : "未知 / 未校验"}</dd>
        </div>
        {item.sheetTags.length > 0 ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">标签</dt>
            <dd className="mt-0.5 flex flex-wrap gap-1">
              {PARTS_SHEET_TAG_ORDER.filter((t) => item.sheetTags.includes(t)).map((t) => (
                <span
                  key={t}
                  className="rounded border border-amber-400/35 bg-amber-500/10 px-1.5 py-px text-[11px] font-medium text-amber-100/95"
                >
                  {PARTS_SHEET_TAG_LABELS[t]}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {reasonLines.length > 0 ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">缺件原因</dt>
            <dd className="mt-0.5 flex flex-wrap gap-1">
              {reasonLines.map((line) => (
                <span
                  key={line}
                  className="rounded border border-sky-400/30 bg-sky-500/10 px-1.5 py-px text-[11px] font-medium text-sky-100/95"
                >
                  {line}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {item.rest ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">
              {showShortageReasonSummary ? "备注原文" : "导入附加列"}
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs text-[var(--muted)]">
              {item.rest}
            </dd>
          </div>
        ) : null}
        {parentSubjectOwned ? (
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">拥有</dt>
            <dd className="mt-0.5 text-[var(--text)]">本 MOC / 套装已在「我的拥有」中标记。</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}

function MocPartDetailBody({
  item,
  titleId,
  onClose,
  parentSubjectOwned,
  showShortageReasonSummary,
  detailSubstituteSuggestions,
}: {
  item: ShortageResolveItem;
  titleId: string;
  onClose: () => void;
  parentSubjectOwned: boolean;
  showShortageReasonSummary: boolean;
  detailSubstituteSuggestions: boolean;
}) {
  const reasonLines = showShortageReasonSummary ? shortageReasonSummaryLines(item.rest) : [];
  const [substitutes, setSubstitutes] = useState<PartSubstituteSuggestion[] | null>(null);
  const [substitutesError, setSubstitutesError] = useState<string | null>(null);

  useEffect(() => {
    if (!detailSubstituteSuggestions) {
      setSubstitutes(null);
      setSubstitutesError(null);
      return;
    }
    let cancelled = false;
    setSubstitutes(null);
    setSubstitutesError(null);
    const pn = item.partNum.trim();
    if (!pn) {
      setSubstitutes([]);
      return;
    }
    void (async () => {
      const res = await getPartSubstituteSuggestionsAction(pn);
      if (cancelled) return;
      if (res.ok) setSubstitutes(res.items);
      else {
        setSubstitutes([]);
        setSubstitutesError(res.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.partNum, detailSubstituteSuggestions]);

  const heroTitle =
    item.partFound && item.partName
      ? item.partName
      : item.partFound
        ? "（无名称）"
        : item.partNum.trim() || "—";
  const showNameRowInDl = !(item.partFound && item.partName);

  const gdsUrl = item.gdsPicture?.trim() || null;
  const legoUrl = item.imgUrl?.trim() || null;
  const catalogDual = detailSubstituteSuggestions;
  const hasGobricksFacts = catalogDual && rowHasGobricksDetailFields(item);
  const catalogImgSizes = "(max-width:639px)72vw,(max-width:1023px)18rem,20rem";

  return (
    <div className="flex flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border-soft)] bg-[rgba(255,255,255,0.025)] px-5 py-3 sm:px-8 sm:py-3.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-2)]">
          {catalogDual ? "乐高与高砖" : "零件摘要"}
        </span>
        <button
          type="button"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-transparent text-2xl leading-none text-[var(--muted)] transition-colors hover:border-[var(--border)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          aria-label="关闭"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="px-5 py-5 sm:px-8 sm:py-7">
        {catalogDual ? (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:items-start sm:gap-x-6 lg:gap-x-8">
            <div className="flex min-w-0 flex-col gap-5 sm:border-r sm:border-[var(--border-soft)] sm:pr-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-2)]">
                乐高 / 本地目录
              </h3>
              {legoUrl ? (
                <CatalogImageFigure label="乐高目录图" imageUrl={legoUrl} sizes={catalogImgSizes} />
              ) : (
                <div className="flex min-h-[10rem] items-center justify-center rounded-xl border border-[var(--border)] bg-[rgba(7,10,18,0.35)] px-4 text-center text-sm text-[var(--muted)]">
                  {item.partFound ? "无目录缩略图" : "未收录"}
                </div>
              )}
              <LegoCatalogDetailBlock
                item={item}
                titleId={titleId}
                heroTitle={heroTitle}
                showNameRowInDl={showNameRowInDl}
                reasonLines={reasonLines}
                showShortageReasonSummary={showShortageReasonSummary}
                parentSubjectOwned={parentSubjectOwned}
                onClose={onClose}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-2)]">
                高砖商城
              </h3>
              {gdsUrl ? (
                <CatalogImageFigure label="高砖商品图" imageUrl={gdsUrl} sizes={catalogImgSizes} />
              ) : (
                <div className="flex min-h-[10rem] items-center justify-center rounded-xl border border-[var(--border)] bg-[rgba(7,10,18,0.35)] px-4 text-center text-sm text-[var(--muted)]">
                  无高砖商品图
                </div>
              )}
              {hasGobricksFacts ? (
                <GobricksDetailSection item={item} showHeading={false} />
              ) : (
                <p className="text-sm leading-relaxed text-[var(--muted)]">
                  暂无高砖字段明细（例如未带 info 的旧同步数据）。
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-7 sm:flex-row sm:items-start sm:gap-10 lg:gap-12">
            <div className="mx-auto aspect-square w-full max-w-[min(16rem,72vw)] shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-[inset_0_1px_0_rgba(0,0,0,0.06)] sm:mx-0 sm:max-w-[18rem] lg:max-w-[20rem]">
              <div className="flex h-full min-h-[12rem] w-full items-center justify-center sm:min-h-0">
                {item.imgUrl ? (
                  <RemoteCoverImage
                    src={item.imgUrl}
                    width={320}
                    height={320}
                    className="h-full max-h-[min(20rem,55vw)] w-full object-contain p-3 sm:max-h-none sm:p-4"
                    sizes="(max-width:639px)72vw,(max-width:1023px)18rem,20rem"
                    fallbackLabel="无图"
                  />
                ) : (
                  <span className="text-sm text-neutral-500">{item.partFound ? "无图" : "未收录"}</span>
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <LegoCatalogDetailBlock
                item={item}
                titleId={titleId}
                heroTitle={heroTitle}
                showNameRowInDl={showNameRowInDl}
                reasonLines={reasonLines}
                showShortageReasonSummary={showShortageReasonSummary}
                parentSubjectOwned={parentSubjectOwned}
                onClose={onClose}
              />
            </div>
          </div>
        )}

        {detailSubstituteSuggestions ? (
          <div className="mt-7 border-t border-[var(--border-soft)] pt-7 sm:mt-8 sm:pt-8">
            <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--surface-2)]/90 p-4 sm:p-5">
              <p className="text-sm leading-relaxed text-[var(--muted)]">
                若需替换或核对模具变体，可参考本地 Rebrickable 目录中的下列关联零件（类型 A/M）：
              </p>
              <h3 className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-2)]">
                推荐替换 · Rebrickable
              </h3>
              {substitutes === null ? (
                <p className="mt-3 text-sm text-[var(--muted)]">加载中…</p>
              ) : substitutesError ? (
                <p className="mt-3 text-sm text-amber-200/90">{substitutesError}</p>
              ) : substitutes.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">无替代或模具变体记录。</p>
              ) : (
                <>
                  <ul className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {substitutes.map((s) => (
                      <li
                        key={s.otherPartNum}
                        className="flex min-h-0 gap-3 rounded-lg border border-[var(--border)]/80 bg-[var(--surface)] px-3 py-2.5 sm:gap-3.5 sm:px-3.5 sm:py-3"
                      >
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-neutral-300/25 bg-white sm:h-16 sm:w-16">
                          {s.imgUrl ? (
                            <RemoteCoverImage
                              src={s.imgUrl}
                              width={64}
                              height={64}
                              className="h-full w-full object-contain p-0.5 sm:p-1"
                              sizes="(max-width:639px)56px,64px"
                              fallbackLabel="无图"
                              fallbackClassName="!text-[9px]"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]">
                              无图
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/parts/${encodeURIComponent(s.otherPartNum)}`}
                              className="font-mono text-xs font-semibold text-[var(--accent)] no-underline hover:underline"
                              onClick={onClose}
                            >
                              {s.otherPartNum}
                            </Link>
                            {s.relTypes.map((t) => (
                              <span
                                key={t}
                                className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1 py-px text-[10px] font-medium text-emerald-100/95"
                              >
                                {substituteRelBadgeLabel(t)}
                              </span>
                            ))}
                          </div>
                          {s.partName ? (
                            <p className="mt-1 text-sm leading-snug text-[var(--muted)]">{s.partName}</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 border-t border-[var(--border-soft)] pt-3 text-[11px] leading-relaxed text-[var(--muted-2)]">
                    数据来自本地 <span className="font-mono">part_relationships</span>；缩略图取自{" "}
                    <span className="font-mono">inventory_parts</span> 中该零件任一角度的库存图。颜色与造型请自行核对。
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 方格列表中备注行（单价在标题旁展示，此处不再重复） */
function partsSheetGridReasonLine(r: ShortageResolveItem, shortageListMode: boolean): string | null {
  const fromCsv = r.rest.trim();
  if (fromCsv) return fromCsv;
  if (!shortageListMode) return null;
  if (!r.partFound) return "本地库未收录该零件号";
  if (!r.elementKnown) return "该零件颜色无官方元素记录";
  if (r.imgSource === "part") return "无该色零件图（已用异色图）";
  return null;
}

type Props = {
  items: ShortageResolveItem[];
  skippedHeader: boolean;
  savedAt: string;
  /** 若提供，列表页脚时间处显示该文案，替代「保存于 … · 导入时含表头」 */
  sourceMetaLine?: string | null;
  /** 各行列 quantity 之和；不传则由 items 现场累加 */
  totalPartQty?: number;
  /** 缺件表视图：缺件原因筛选、网格备注与详情弹层中的缺件原因摘要 */
  shortageListMode?: boolean;
  /** 已在「我的拥有」中标记本 MOC/套装时，零件表内所有行使用拥有高亮样式 */
  parentSubjectOwned?: boolean;
  /** 配货表 / 缺件表：详情弹层展示目录库中的推荐替换零件（part_relationships A/M） */
  detailSubstituteSuggestions?: boolean;
};

export function MocPartsList({
  items,
  skippedHeader,
  savedAt,
  sourceMetaLine = null,
  totalPartQty: totalPartQtyProp,
  shortageListMode = false,
  parentSubjectOwned = false,
  detailSubstituteSuggestions = false,
}: Props) {
  const [sheetListFilter, setSheetListFilter] = useState<SheetListFilter>("all");
  const [shortageReasonFilter, setShortageReasonFilter] = useState<ShortageReasonFilterId>("all");
  const [detailItem, setDetailItem] = useState<ShortageResolveItem | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);
  const detailTitleId = useId();

  const shortageReasonOptions = useMemo(() => {
    if (!shortageListMode) return [];
    return getShortageReasonFilterOptionsFromRests(items.map((r) => r.rest));
  }, [shortageListMode, items]);

  useEffect(() => {
    if (!shortageListMode) return;
    if (shortageReasonFilter === "all") return;
    const ids = new Set(shortageReasonOptions.map((o) => o.id));
    if (!ids.has(shortageReasonFilter)) setShortageReasonFilter("all");
  }, [shortageListMode, shortageReasonFilter, shortageReasonOptions]);

  const sheetFilterOptions = useMemo(() => getSheetFilterOptionsFromItems(items), [items]);

  useEffect(() => {
    if (sheetListFilter === "all") return;
    const ids = new Set(sheetFilterOptions.map((o) => o.id));
    if (!ids.has(sheetListFilter)) setSheetListFilter("all");
  }, [sheetListFilter, sheetFilterOptions]);

  const listAfterShortageReason = useMemo(
    () =>
      shortageListMode
        ? items.filter((r) => rowMatchesShortageReasonFilter(r.rest, shortageReasonFilter))
        : items,
    [shortageListMode, items, shortageReasonFilter]
  );

  const listFiltered = useMemo(
    () => listAfterShortageReason.filter((r) => rowMatchesSheetListFilter(r, sheetListFilter)),
    [listAfterShortageReason, sheetListFilter]
  );

  const totalPartQty = useMemo(() => {
    if (!shortageListMode && typeof totalPartQtyProp === "number" && Number.isFinite(totalPartQtyProp)) {
      return totalPartQtyProp;
    }
    return items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
  }, [items, totalPartQtyProp, shortageListMode]);

  const missingParts = items.filter((i) => !i.partFound).length;
  const noImage = items.filter(
    (i) => i.partFound && !sheetRowListThumbSrc(i, detailSubstituteSuggestions)
  ).length;

  const closeDetail = useCallback(() => {
    detailDialogRef.current?.close();
    setDetailItem(null);
  }, []);

  useEffect(() => {
    const d = detailDialogRef.current;
    if (!d) return;
    if (detailItem) {
      if (!d.open) void d.showModal();
    } else if (d.open) {
      d.close();
    }
  }, [detailItem]);

  return (
    <section className="space-y-3" aria-label="零件列表">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs text-[var(--muted)]">
          共 {totalPartQty.toLocaleString("zh-CN")} 个零件
          <span className="text-[var(--muted-2)]">（{items.length.toLocaleString("zh-CN")} 行）</span>
          {(shortageReasonFilter !== "all" || sheetListFilter !== "all") &&
          listFiltered.length !== items.length
            ? `，当前筛选 ${listFiltered.length} 条`
            : ""}
          {sourceMetaLine != null && sourceMetaLine !== "" ? (
            <>
              {" · "}
              {sourceMetaLine}
            </>
          ) : (
            <>
              {" · "}
              保存于 {savedAt.slice(0, 19).replace("T", " ")}
              {skippedHeader ? " · 导入时含表头" : ""}
            </>
          )}
        </p>
      </div>

      <div className="meta-row flex flex-col gap-2 text-xs text-[var(--muted)]">
        {shortageListMode && shortageReasonOptions.length > 1 ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--muted-2)]">缺件原因：</span>
            {shortageReasonOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  shortageReasonFilter === opt.id
                    ? "border-sky-400/55 bg-sky-500/15 text-sky-100/95"
                    : "border-[var(--border-soft)] text-[var(--muted)] hover:border-sky-400/35 hover:bg-[var(--surface-2)]"
                }`}
                onClick={() => setShortageReasonFilter(opt.id)}
              >
                {opt.id === "all" ? opt.label : `${opt.label}（${opt.count}）`}
              </button>
            ))}
          </span>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {sheetFilterOptions.length > 1 ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--muted-2)]">零件类型：</span>
            {sheetFilterOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                  sheetListFilter === opt.id
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                    : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                }`}
                onClick={() => setSheetListFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </span>
        ) : null}
        {missingParts > 0 ? (
          <span className="text-amber-200/90">本地库未收录：{missingParts} 条</span>
        ) : null}
        {noImage > 0 ? <span>有收录但无库存图：{noImage} 条</span> : null}
        </div>
      </div>

      {listFiltered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {shortageListMode
            ? "当前筛选下没有匹配条目。未收录零件不参与「零件类型」筛选；可点「全部」或调整「缺件原因」查看完整列表。"
            : "当前筛选下没有匹配条目。未收录零件不参与「零件类型」筛选；可点「全部」查看完整列表。"}
        </p>
      ) : (
        <div className="tiles-grid">
          {listFiltered.map((r, idx) => {
            const reasonLine = partsSheetGridReasonLine(r, shortageListMode);
            const thumbSrc = sheetRowListThumbSrc(r, detailSubstituteSuggestions);
            const tileClass = [
              PART_GRID_TILE_CLASS_BASE,
              parentSubjectOwned ? PART_GRID_TILE_OWNED_HIGHLIGHT : "",
            ]
              .filter(Boolean)
              .join(" ");
            const inner = (
              <>
                {detailSubstituteSuggestions && r.gdsPicture?.trim() ? (
                  <span className="pointer-events-none absolute right-1 top-1 z-[1] truncate text-[9px] font-medium leading-none text-violet-200/95">
                    高砖
                  </span>
                ) : null}
                {detailSubstituteSuggestions && !r.gdsPicture?.trim() && r.imgSource === "part" ? (
                  <span className="pointer-events-none absolute left-1 right-1 top-1 z-[1] truncate text-[9px] font-medium leading-none text-orange-300/95">
                    异色图
                  </span>
                ) : null}
                {!detailSubstituteSuggestions && r.imgSource === "part" ? (
                  <span className="pointer-events-none absolute left-1 right-1 top-1 z-[1] truncate text-[9px] font-medium leading-none text-orange-300/95">
                    异色图
                  </span>
                ) : null}
                {!r.partFound ? (
                  <span className="pointer-events-none absolute left-1 top-1 z-[1] max-w-[calc(100%-2.5rem)] truncate text-[9px] font-medium leading-none text-amber-200/95">
                    未收录
                  </span>
                ) : null}
                <div className="relative mx-auto mt-3 aspect-square w-[calc(100%-0.25rem)] max-w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
                  {thumbSrc ? (
                    <RemoteCoverImage
                      src={thumbSrc}
                      fill
                      className="object-contain p-0.5"
                      sizes="(max-width:640px)20vw,4.5rem"
                      fallbackLabel={r.partFound ? "无图" : "?"}
                      fallbackClassName="!text-[9px]"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--muted)]">
                      {r.partFound ? "无图" : "?"}
                    </span>
                  )}
                </div>
                <p className="mt-1 min-h-0 w-full shrink-0 truncate px-0.5 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                  {r.quantity} × {r.partNum}
                </p>
                {reasonLine ? (
                  <p
                    className="mt-0.5 line-clamp-2 w-full shrink-0 break-words px-0.5 text-center text-[9px] leading-snug text-[var(--muted)] sm:text-[10px]"
                    title={reasonLine}
                  >
                    {reasonLine}
                  </p>
                ) : null}
              </>
            );
            const key = `${r.lineNumber}-${r.partNum}-${r.colorId}-${idx}`;
            const title = `${r.quantity} × ${r.partNum}${r.colorName ? ` · ${r.colorName}` : ""}${
              reasonLine ? ` · ${reasonLine}` : ""
            }`;
            return (
              <button
                key={key}
                type="button"
                title={title}
                className={tileClass}
                onClick={() => setDetailItem(r)}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}

      <dialog
        ref={detailDialogRef}
        className="fixed left-0 top-0 z-[200] m-0 h-dvh max-h-dvh w-screen max-w-none border-0 bg-transparent p-0 text-[var(--text)] shadow-none outline-none backdrop:bg-transparent"
        aria-labelledby={detailTitleId}
        onClose={() => setDetailItem(null)}
      >
        {detailItem ? (
          <div
            className="flex h-dvh w-screen items-center justify-center bg-black/45 p-4 sm:p-6 lg:p-10"
            role="presentation"
            onClick={closeDetail}
          >
            <div
              className="max-h-[min(92dvh,52rem)] w-full max-w-[min(64rem,calc(100vw-1.25rem))] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.55)] sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <MocPartDetailBody
                item={detailItem}
                titleId={detailTitleId}
                onClose={closeDetail}
                parentSubjectOwned={parentSubjectOwned}
                showShortageReasonSummary={shortageListMode}
                detailSubstituteSuggestions={detailSubstituteSuggestions}
              />
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
