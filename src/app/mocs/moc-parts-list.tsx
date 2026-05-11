"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PARTS_SHEET_TAG_LABELS, PARTS_SHEET_TAG_ORDER } from "@/lib/parts-sheet-tags";
import {
  getSheetFilterOptionsFromItems,
  rowMatchesSheetListFilter,
  type SheetListFilter,
} from "@/lib/parts-sheet-list-filter";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type Props = {
  items: ShortageResolveItem[];
  skippedHeader: boolean;
  savedAt: string;
  /** 链到零件表（含 loadMoc），便于对照编辑 */
  partsSheetHref?: string;
};

export function MocPartsList({ items, skippedHeader, savedAt, partsSheetHref }: Props) {
  const [sheetListFilter, setSheetListFilter] = useState<SheetListFilter>("all");

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

  const missingParts = items.filter((i) => !i.partFound).length;
  const noImage = items.filter((i) => i.partFound && !i.imgUrl).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--text)]">零件列表</h2>
        <p className="text-xs text-[var(--muted)]">
          共 {items.length} 行
          {sheetListFilter !== "all" && listFiltered.length !== items.length
            ? `，当前分类 ${listFiltered.length} 条`
            : ""}
          {" · "}
          保存于 {savedAt.slice(0, 19).replace("T", " ")}
          {skippedHeader ? " · 导入时含表头" : ""}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        分类与「零件表」页一致：未收录零件不参与分类；仅作浏览筛选。
        {partsSheetHref ? (
          <>
            {" "}
            <Link href={partsSheetHref} className="text-[var(--accent)] underline underline-offset-2">
              在零件表中编辑
            </Link>
            。
          </>
        ) : null}
      </p>

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
        <ul className="content-grid">
          {listFiltered.map((r, idx) => (
            <li key={`${r.lineNumber}-${r.partNum}-${r.colorId}-${idx}`} className="result-card">
              <div className="media-box media-box-sm">
                {r.imgUrl ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <Image
                      src={r.imgUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="box-border h-full w-full object-contain p-0.5"
                      sizes="56px"
                    />
                  </div>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[9px] leading-tight text-[var(--muted)]">
                    {r.partFound ? "无图" : "?"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {r.partFound ? (
                    <Link
                      href={`/parts/${encodeURIComponent(r.partNum)}`}
                      className="font-mono text-xs font-semibold text-[var(--accent)] sm:text-[13px]"
                    >
                      {r.partNum}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs font-semibold text-amber-200/90 sm:text-[13px]">
                      {r.partNum}
                    </span>
                  )}
                  <span className="badge bg-[var(--surface-3)]">
                    色 {r.colorId}
                    {r.colorName ? ` · ${r.colorName}` : ""}
                  </span>
                  <span className="badge badge-accent">×{r.quantity}</span>
                  {r.imgSource === "part" ? (
                    <span className="text-[10px] text-[var(--muted)]" title="当前颜色无库存图，已使用该零件其他颜色的图片">
                      图·异色
                    </span>
                  ) : null}
                  {r.partFound
                    ? PARTS_SHEET_TAG_ORDER.filter((t) => r.sheetTags.includes(t)).map((t) => (
                        <span
                          key={t}
                          className="rounded border border-amber-400/35 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-100/95"
                        >
                          {PARTS_SHEET_TAG_LABELS[t]}
                        </span>
                      ))
                    : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--text)]">
                  {r.partFound && r.partName ? (
                    <>
                      {r.partName}
                      {r.partCatName ? <span className="text-[var(--muted)]"> · {r.partCatName}</span> : null}
                    </>
                  ) : r.partFound ? (
                    <span className="text-[var(--muted)]">（无名称）</span>
                  ) : (
                    <span className="text-amber-200/85">本地库中无此 part_num。</span>
                  )}
                </p>
                {r.rest ? (
                  <p className="meta-row mt-1 text-[10px] leading-relaxed text-[var(--muted)]">{r.rest}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
