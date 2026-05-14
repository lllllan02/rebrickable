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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="font-mono text-sm font-semibold text-[var(--text)]">
            {item.partNum}
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">第 {item.lineNumber} 行 · 数量 {item.quantity}</p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex aspect-square w-full max-w-[14rem] items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
          {item.imgUrl ? (
            <RemoteCoverImage
              src={item.imgUrl}
              width={224}
              height={224}
              className="h-full w-full object-contain p-2"
              sizes="(max-width:640px)70vw,14rem"
              fallbackLabel="无图"
            />
          ) : (
            <span className="text-xs text-[var(--muted)]">{item.partFound ? "无图" : "未收录"}</span>
          )}
        </div>

        <dl className="mt-4 space-y-2.5 text-sm">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">名称</dt>
            <dd className="mt-0.5 text-[var(--text)]">
              {item.partFound && item.partName ? item.partName : item.partFound ? "（无名称）" : "本地库中无此 part_num"}
            </dd>
          </div>
          {item.partCatName ? (
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">大类</dt>
              <dd className="mt-0.5 text-[var(--text)]">{item.partCatName}</dd>
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

        {detailSubstituteSuggestions ? (
          <div className="mt-4 border-t border-[var(--border-soft)] pt-4">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">
              推荐替换（Rebrickable 目录）
            </h3>
            {substitutes === null ? (
              <p className="mt-2 text-xs text-[var(--muted)]">加载中…</p>
            ) : substitutesError ? (
              <p className="mt-2 text-xs text-amber-200/90">{substitutesError}</p>
            ) : substitutes.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">无替代或模具变体记录。</p>
            ) : (
              <>
                <ul className="mt-2 space-y-2.5 text-sm">
                  {substitutes.map((s) => (
                    <li
                      key={s.otherPartNum}
                      className="flex gap-2.5 rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-2.5 py-2"
                    >
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
                        {s.imgUrl ? (
                          <RemoteCoverImage
                            src={s.imgUrl}
                            width={56}
                            height={56}
                            className="h-full w-full object-contain p-0.5"
                            sizes="56px"
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
                          <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{s.partName}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] leading-snug text-[var(--muted-2)]">
                  数据来自本地 <span className="font-mono">part_relationships</span>（类型 A/M）；缩略图取自{" "}
                  <span className="font-mono">inventory_parts</span> 中该零件任一角度的库存图。颜色与造型请自行核对。
                </p>
              </>
            )}
          </div>
        ) : null}

        {item.partFound ? (
          <p className="mt-5 border-t border-[var(--border-soft)] pt-4 text-xs">
            <a
              href={`/parts/${encodeURIComponent(item.partNum)}`}
              className="text-[var(--accent)] underline underline-offset-2"
              onClick={onClose}
            >
              打开零件页
            </a>
          </p>
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
  /** 缺件表视图：缺件原因筛选、网格备注与详情侧栏缺件原因摘要 */
  shortageListMode?: boolean;
  /** 已在「我的拥有」中标记本 MOC/套装时，零件表内所有行使用拥有高亮样式 */
  parentSubjectOwned?: boolean;
  /** 配货表 / 缺件表：侧栏展示目录库中的推荐替换零件（part_relationships A/M） */
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
  const noImage = items.filter((i) => i.partFound && !i.imgUrl).length;

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
            const tileClass = [
              PART_GRID_TILE_CLASS_BASE,
              parentSubjectOwned ? PART_GRID_TILE_OWNED_HIGHLIGHT : "",
            ]
              .filter(Boolean)
              .join(" ");
            const inner = (
              <>
                {r.imgSource === "part" ? (
                  <span className="pointer-events-none absolute left-1 right-1 top-1 z-[1] truncate text-[9px] font-medium leading-none text-orange-300/95">
                    异色图
                  </span>
                ) : null}
                {!r.partFound ? (
                  <span className="pointer-events-none absolute left-1 right-1 top-1 z-[1] truncate text-[9px] font-medium leading-none text-amber-200/95">
                    未收录
                  </span>
                ) : null}
                <div className="relative mx-auto mt-3 aspect-square w-[calc(100%-0.25rem)] max-w-[4.5rem] shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
                  {r.imgUrl ? (
                    <RemoteCoverImage
                      src={r.imgUrl}
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
          <div className="flex h-dvh w-screen flex-col sm:flex-row">
            <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] sm:order-2 sm:h-full sm:max-w-[min(22rem,100vw)] sm:flex-none sm:rounded-l-[var(--radius-md)] sm:border-l">
              <MocPartDetailBody
                item={detailItem}
                titleId={detailTitleId}
                onClose={closeDetail}
                parentSubjectOwned={parentSubjectOwned}
                showShortageReasonSummary={shortageListMode}
                detailSubstituteSuggestions={detailSubstituteSuggestions}
              />
            </div>
            <button
              type="button"
              className="order-2 min-h-[22dvh] shrink-0 cursor-default border-0 bg-black/40 p-0 sm:order-1 sm:min-h-0 sm:flex-1 sm:bg-black/35"
              aria-label="关闭详情"
              onClick={closeDetail}
            />
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
