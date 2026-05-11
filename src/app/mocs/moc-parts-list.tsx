"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { PARTS_SHEET_TAG_LABELS, PARTS_SHEET_TAG_ORDER } from "@/lib/parts-sheet-tags";
import {
  getSheetFilterOptionsFromItems,
  rowMatchesSheetListFilter,
  type SheetListFilter,
} from "@/lib/parts-sheet-list-filter";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

function MocPartDetailBody({
  item,
  titleId,
  onClose,
}: {
  item: ShortageResolveItem;
  titleId: string;
  onClose: () => void;
}) {
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
            <Image
              src={item.imgUrl}
              alt=""
              width={224}
              height={224}
              className="h-full w-full object-contain p-2"
              sizes="(max-width:640px)70vw,14rem"
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
          {item.rest ? (
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">导入附加列</dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words font-mono text-xs text-[var(--muted)]">{item.rest}</dd>
            </div>
          ) : null}
        </dl>

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

type Props = {
  items: ShortageResolveItem[];
  skippedHeader: boolean;
  savedAt: string;
  /** 各行列 quantity 之和；不传则由 items 现场累加 */
  totalPartQty?: number;
};

export function MocPartsList({ items, skippedHeader, savedAt, totalPartQty: totalPartQtyProp }: Props) {
  const [sheetListFilter, setSheetListFilter] = useState<SheetListFilter>("all");
  const [detailItem, setDetailItem] = useState<ShortageResolveItem | null>(null);
  const detailDialogRef = useRef<HTMLDialogElement>(null);
  const detailTitleId = useId();

  const sheetFilterOptions = useMemo(() => getSheetFilterOptionsFromItems(items), [items]);

  useEffect(() => {
    if (sheetListFilter === "all") return;
    const ids = new Set(sheetFilterOptions.map((o) => o.id));
    if (!ids.has(sheetListFilter)) setSheetListFilter("all");
  }, [sheetListFilter, sheetFilterOptions]);

  const listFiltered = useMemo(
    () => items.filter((r) => rowMatchesSheetListFilter(r, sheetListFilter)),
    [items, sheetListFilter]
  );

  const totalPartQty = useMemo(() => {
    if (typeof totalPartQtyProp === "number" && Number.isFinite(totalPartQtyProp)) {
      return totalPartQtyProp;
    }
    return items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
  }, [items, totalPartQtyProp]);

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
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">零件列表</h2>
        <p className="text-xs text-[var(--muted)]">
          共 {totalPartQty.toLocaleString("zh-CN")} 个零件
          <span className="text-[var(--muted-2)]">（{items.length.toLocaleString("zh-CN")} 行）</span>
          {sheetListFilter !== "all" && listFiltered.length !== items.length
            ? `，当前分类 ${listFiltered.length} 条`
            : ""}
          {" · "}
          保存于 {savedAt.slice(0, 19).replace("T", " ")}
          {skippedHeader ? " · 导入时含表头" : ""}
        </p>
      </div>

      <div className="meta-row flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--muted)]">
        {sheetFilterOptions.length > 1 ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-[var(--muted-2)]">分类：</span>
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

      {listFiltered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          当前分类下没有匹配条目。未收录零件不参与分类筛选；可点「全部」查看完整列表。
        </p>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(5.75rem, 1fr))" }}
        >
            {listFiltered.map((r, idx) => (
              <button
                key={`${r.lineNumber}-${r.partNum}-${r.colorId}-${idx}`}
                type="button"
                title={`${r.quantity} × ${r.partNum}${r.colorName ? ` · ${r.colorName}` : ""}`}
                className="group relative flex flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-1 pb-1.5 text-left shadow-[var(--shadow)] transition-[border-color,transform,background-color] duration-150 hover:-translate-y-px hover:border-amber-400/45 hover:bg-[linear-gradient(180deg,rgba(247,200,75,0.08),rgba(255,255,255,0.025))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                onClick={() => setDetailItem(r)}
              >
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
                <div className="relative mx-auto mt-3 aspect-square w-[calc(100%-0.25rem)] max-w-[4.5rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
                  {r.imgUrl ? (
                    <Image
                      src={r.imgUrl}
                      alt=""
                      fill
                      className="object-contain p-0.5"
                      sizes="(max-width:640px)20vw,4.5rem"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--muted)]">
                      {r.partFound ? "无图" : "?"}
                    </span>
                  )}
                </div>
                <p className="mt-1 truncate px-0.5 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                  {r.quantity} × {r.partNum}
                </p>
              </button>
            ))}
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
              <MocPartDetailBody item={detailItem} titleId={detailTitleId} onClose={closeDetail} />
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
