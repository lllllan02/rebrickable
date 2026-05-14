"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { postResolvePartsSheetCsv } from "@/lib/parts-sheet-post-resolve";
import { serializeShortageCsv } from "@/lib/serialize-shortage-csv";
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

type ColorOption = {
  id: number;
  name: string;
  rgb: string;
  isTrans: boolean;
};

function isValidColorPayload(data: unknown): data is { colors: ColorOption[] } {
  if (typeof data !== "object" || data === null || !("colors" in data)) return false;
  const { colors: c } = data as { colors: unknown };
  if (!Array.isArray(c)) return false;
  return c.every(
    (row) =>
      typeof row === "object" &&
      row !== null &&
      "id" in row &&
      typeof (row as { id: unknown }).id === "number" &&
      "name" in row &&
      typeof (row as { name: unknown }).name === "string" &&
      "rgb" in row &&
      typeof (row as { rgb: unknown }).rgb === "string" &&
      "isTrans" in row &&
      typeof (row as { isTrans: unknown }).isTrans === "boolean"
  );
}

function rowSame(a: ShortageResolveItem, b: ShortageResolveItem): boolean {
  return (
    a.lineNumber === b.lineNumber &&
    a.partNum === b.partNum &&
    a.colorId === b.colorId &&
    a.quantity === b.quantity &&
    (a.gobricksUnitPrice ?? "") === (b.gobricksUnitPrice ?? "")
  );
}

/** 方格列表中备注行（单价在标题旁展示，此处不再重复） */
function partsSheetGridReasonLine(r: ShortageResolveItem, shortageEditable: boolean): string | null {
  const fromCsv = r.rest.trim();
  if (fromCsv) return fromCsv;
  if (!shortageEditable) return null;
  if (!r.partFound) return "本地库未收录该零件号";
  if (!r.elementKnown) return "该零件颜色无官方元素记录";
  if (r.imgSource === "part") return "无该色零件图（已用异色图）";
  return null;
}

type ShortagePersistFn = (
  items: ShortageResolveItem[],
  nextSkippedHeader: boolean
) => Promise<{ ok: true } | { ok: false; error: string }>;

type Props = {
  items: ShortageResolveItem[];
  skippedHeader: boolean;
  savedAt: string;
  /** 若提供，列表页脚时间处显示该文案，替代「保存于 … · 导入时含表头」 */
  sourceMetaLine?: string | null;
  /** 各行列 quantity 之和；不传则由 items 现场累加 */
  totalPartQty?: number;
  /** 缺件表：允许删除行、换色并持久化 */
  shortageEditable?: { onPersist: ShortagePersistFn } | null;
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
  shortageEditable = null,
  parentSubjectOwned = false,
  detailSubstituteSuggestions = false,
}: Props) {
  const [sheetListFilter, setSheetListFilter] = useState<SheetListFilter>("all");
  const [shortageReasonFilter, setShortageReasonFilter] = useState<ShortageReasonFilterId>("all");
  const [detailItem, setDetailItem] = useState<ShortageResolveItem | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);
  const detailTitleId = useId();
  const [draftItems, setDraftItems] = useState<ShortageResolveItem[]>(items);
  const [draftSkippedHeader, setDraftSkippedHeader] = useState(skippedHeader);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const colorDialogRef = useRef<HTMLDialogElement>(null);
  const colorLabelId = useId();
  const [colorEditRow, setColorEditRow] = useState<ShortageResolveItem | null>(null);
  const [selectedColorId, setSelectedColorId] = useState(0);
  const [colorFilter, setColorFilter] = useState("");
  const [colorsOptions, setColorsOptions] = useState<ColorOption[] | null>(null);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [colorsLoadError, setColorsLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!shortageEditable) return;
    setDraftItems(items);
    setDraftSkippedHeader(skippedHeader);
    setEditError(null);
  }, [shortageEditable, items, skippedHeader, savedAt]);

  useEffect(() => {
    if (!colorEditRow) return;
    const d = colorDialogRef.current;
    if (d && !d.open) d.showModal();
  }, [colorEditRow]);

  useEffect(() => {
    if (!colorEditRow) return;
    if (colorsOptions !== null) return;
    void (async () => {
      setColorsLoading(true);
      setColorsLoadError(null);
      try {
        const res = await fetch("/api/colors");
        const data: unknown = await res.json().catch(() => null);
        if (!res.ok || !isValidColorPayload(data)) {
          setColorsLoadError("颜色列表加载失败。");
          return;
        }
        setColorsOptions(data.colors);
      } catch {
        setColorsLoadError("颜色列表加载失败。");
      } finally {
        setColorsLoading(false);
      }
    })();
  }, [colorEditRow, colorsOptions]);

  const displayItems = shortageEditable ? draftItems : items;

  const shortageReasonOptions = useMemo(() => {
    if (!shortageEditable) return [];
    return getShortageReasonFilterOptionsFromRests(displayItems.map((r) => r.rest));
  }, [shortageEditable, displayItems]);

  useEffect(() => {
    if (!shortageEditable) return;
    if (shortageReasonFilter === "all") return;
    const ids = new Set(shortageReasonOptions.map((o) => o.id));
    if (!ids.has(shortageReasonFilter)) setShortageReasonFilter("all");
  }, [shortageEditable, shortageReasonFilter, shortageReasonOptions]);

  const sheetFilterOptions = useMemo(
    () => getSheetFilterOptionsFromItems(displayItems),
    [displayItems]
  );

  useEffect(() => {
    if (sheetListFilter === "all") return;
    const ids = new Set(sheetFilterOptions.map((o) => o.id));
    if (!ids.has(sheetListFilter)) setSheetListFilter("all");
  }, [sheetListFilter, sheetFilterOptions]);

  const listAfterShortageReason = useMemo(
    () =>
      shortageEditable
        ? displayItems.filter((r) => rowMatchesShortageReasonFilter(r.rest, shortageReasonFilter))
        : displayItems,
    [shortageEditable, displayItems, shortageReasonFilter]
  );

  const listFiltered = useMemo(
    () => listAfterShortageReason.filter((r) => rowMatchesSheetListFilter(r, sheetListFilter)),
    [listAfterShortageReason, sheetListFilter]
  );

  const totalPartQty = useMemo(() => {
    if (!shortageEditable && typeof totalPartQtyProp === "number" && Number.isFinite(totalPartQtyProp)) {
      return totalPartQtyProp;
    }
    return displayItems.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
  }, [displayItems, totalPartQtyProp, shortageEditable]);

  const missingParts = displayItems.filter((i) => !i.partFound).length;
  const noImage = displayItems.filter((i) => i.partFound && !i.imgUrl).length;

  const filteredColors = useMemo(() => {
    if (!colorsOptions) return [];
    const raw = colorFilter.trim().toLowerCase();
    if (!raw) return colorsOptions;
    const forRgb = raw.replace(/^#/, "");
    return colorsOptions.filter(
      (c) =>
        String(c.id).includes(forRgb) ||
        c.name.toLowerCase().includes(raw) ||
        c.rgb.toLowerCase().includes(forRgb)
    );
  }, [colorFilter, colorsOptions]);

  const resolveAndPersist = useCallback(
    async (nextItems: ShortageResolveItem[], nextSkipped: boolean) => {
      if (!shortageEditable) return;
      setEditBusy(true);
      setEditError(null);
      try {
        const csv = serializeShortageCsv(
          nextItems.map((r) => ({
            partNum: r.partNum,
            colorId: r.colorId,
            quantity: r.quantity,
            gobricksUnitPrice: r.gobricksUnitPrice,
            rest: r.rest,
          })),
          { includeHeader: nextSkipped }
        );
        const result = await postResolvePartsSheetCsv(csv);
        if ("error" in result && result.error) {
          setEditError(result.error);
          return;
        }
        const resolved = result.items;
        setDraftItems(resolved);
        setDraftSkippedHeader(result.skippedHeader);
        const pr = await shortageEditable.onPersist(resolved, result.skippedHeader);
        if (!pr.ok) {
          setEditError(pr.error);
        }
      } catch {
        setEditError("处理失败，请重试。");
      } finally {
        setEditBusy(false);
      }
    },
    [shortageEditable]
  );

  const onDeleteRow = useCallback(
    async (row: ShortageResolveItem) => {
      if (!shortageEditable) return;
      const next = draftItems.filter((x) => !rowSame(x, row));
      if (next.length === 0) {
        setEditError("缺件表至少保留一行，或清空后重新上传 CSV。");
        return;
      }
      await resolveAndPersist(next, draftSkippedHeader);
    },
    [draftItems, draftSkippedHeader, resolveAndPersist, shortageEditable]
  );

  const openColorForRow = useCallback((row: ShortageResolveItem) => {
    setColorFilter("");
    setSelectedColorId(row.colorId);
    setColorEditRow(row);
  }, []);

  const closeColorDialog = useCallback(() => {
    setColorEditRow(null);
    setSelectedColorId(0);
    setColorFilter("");
    colorDialogRef.current?.close();
  }, []);

  const applyColorChange = useCallback(async () => {
    if (!shortageEditable || !colorEditRow) return;
    if (!Number.isFinite(selectedColorId) || selectedColorId < 0) {
      setEditError("请从列表中选择颜色。");
      return;
    }
    if (selectedColorId === colorEditRow.colorId) {
      closeColorDialog();
      return;
    }
    const next = draftItems.map((r) =>
      rowSame(r, colorEditRow) ? { ...r, colorId: selectedColorId } : r
    );
    closeColorDialog();
    await resolveAndPersist(next, draftSkippedHeader);
  }, [
    closeColorDialog,
    colorEditRow,
    draftItems,
    draftSkippedHeader,
    resolveAndPersist,
    selectedColorId,
    shortageEditable,
  ]);

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
          <span className="text-[var(--muted-2)]">（{displayItems.length.toLocaleString("zh-CN")} 行）</span>
          {(shortageReasonFilter !== "all" || sheetListFilter !== "all") &&
          listFiltered.length !== displayItems.length
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
              {(shortageEditable ? draftSkippedHeader : skippedHeader) ? " · 导入时含表头" : ""}
            </>
          )}
        </p>
      </div>

      {shortageEditable ? (
        <p className="text-xs text-[var(--muted)]">
          可删除指定行或更换颜色；修改将重新解析并写入缺件表。
          {editBusy ? <span className="ml-2 text-[var(--accent)]">保存中…</span> : null}
        </p>
      ) : null}
      {editError ? (
        <p className="rounded-md border border-red-400/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-red-200/95">
          {editError}
        </p>
      ) : null}

      <div className="meta-row flex flex-col gap-2 text-xs text-[var(--muted)]">
        {shortageEditable && shortageReasonOptions.length > 1 ? (
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
          当前筛选下没有匹配条目。未收录零件不参与「零件类型」筛选；可点「全部」或调整「缺件原因」查看完整列表。
        </p>
      ) : (
        <div className="tiles-grid">
          {listFiltered.map((r, idx) => {
            const reasonLine = partsSheetGridReasonLine(r, Boolean(shortageEditable));
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
                {shortageEditable ? (
                  <div
                    className="mt-0.5 flex shrink-0 justify-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={editBusy}
                      className="rounded border border-[var(--border)] bg-[rgba(7,10,18,0.88)] px-1 py-px text-[9px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                      onClick={() => void onDeleteRow(r)}
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      disabled={editBusy}
                      className="rounded border border-[var(--border)] bg-[rgba(7,10,18,0.88)] px-1 py-px text-[9px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                      onClick={() => openColorForRow(r)}
                    >
                      换色
                    </button>
                  </div>
                ) : null}
              </>
            );
            const key = `${r.lineNumber}-${r.partNum}-${r.colorId}-${idx}`;
            const title = `${r.quantity} × ${r.partNum}${r.colorName ? ` · ${r.colorName}` : ""}${
              reasonLine ? ` · ${reasonLine}` : ""
            }`;
            if (shortageEditable) {
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  title={title}
                  className={`${tileClass} cursor-pointer`}
                  onClick={() => setDetailItem(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailItem(r);
                    }
                  }}
                >
                  {inner}
                </div>
              );
            }
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
        ref={colorDialogRef}
        className="fixed left-1/2 top-1/2 z-[210] m-0 max-h-[min(92vh,40rem)] w-[min(100vw-1.5rem,26rem)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/55"
        aria-labelledby={colorLabelId}
        onClose={closeColorDialog}
      >
        {colorEditRow ? (
          <form
            className="flex max-h-[min(88vh,38rem)] flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void applyColorChange();
            }}
          >
            <h2 id={colorLabelId} className="text-sm font-semibold">
              更换颜色
            </h2>
            <p className="text-xs text-[var(--muted)]">
              零件{" "}
              <span className="font-mono text-[var(--text)]">{colorEditRow.partNum}</span>
              ，请从库中选择颜色；也可打开{" "}
              <Link href="/colors" className="underline">
                颜色表
              </Link>{" "}
              对照色块。
            </p>
            {colorsLoadError ? (
              <div className="rounded-md border border-red-400/25 bg-[var(--danger-soft)] px-3 py-2 text-xs text-red-200/95">
                <p>{colorsLoadError}</p>
              </div>
            ) : null}
            <label className="block shrink-0 text-xs text-[var(--muted)]">
              筛选
              <input
                type="search"
                value={colorFilter}
                onChange={(e) => setColorFilter(e.target.value)}
                placeholder="名称、ID 或 RGB…"
                className="field mt-1 w-full text-sm"
                disabled={colorsLoading || !colorsOptions}
              />
            </label>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]">
              {colorsLoading && !colorsOptions ? (
                <p className="p-4 text-center text-sm text-[var(--muted)]">加载颜色中…</p>
              ) : colorsOptions ? (
                <ul
                  className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-contain p-1.5"
                  role="listbox"
                  aria-label="颜色列表"
                >
                  {filteredColors.length === 0 ? (
                    <li className="px-2 py-4 text-center text-sm text-[var(--muted)]">无匹配项</li>
                  ) : (
                    filteredColors.map((c) => {
                      const active = c.id === selectedColorId;
                      return (
                        <li key={c.id} className="py-0.5">
                          <button
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left text-sm transition-colors ${
                              active
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                                : "border-transparent text-[var(--text)] hover:bg-[var(--surface-3)]"
                            }`}
                            onClick={() => setSelectedColorId(c.id)}
                          >
                            <span
                              className="color-swatch h-6 w-9 shrink-0 rounded-sm border border-[var(--border)]"
                              style={{ background: `#${c.rgb}` }}
                            />
                            <span className="shrink-0 font-mono text-xs text-[var(--muted)]">{c.id}</span>
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--border-soft)] pt-3">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surface-2)]"
                onClick={() => closeColorDialog()}
              >
                取消
              </button>
              <button
                type="submit"
                className="button-primary text-sm"
                disabled={
                  editBusy ||
                  colorsLoading ||
                  !colorsOptions ||
                  Boolean(colorsLoadError) ||
                  selectedColorId === colorEditRow.colorId
                }
              >
                应用并保存
              </button>
            </div>
          </form>
        ) : null}
      </dialog>

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
                showShortageReasonSummary={Boolean(shortageEditable)}
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
