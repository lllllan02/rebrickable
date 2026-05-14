"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import type { BuildSubjectKind } from "@/lib/build-subject";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

import {
  getPartSubstituteSuggestionsAction,
  type PartSubstituteSuggestion,
} from "@/app/mocs/part-substitute-suggestions-action";
import { replaceBuildPartsSheetRowAction } from "@/app/mocs/moc-parts-sheet-actions";
import {
  getDefaultPartCategoryForSheetReplaceAction,
  listGobricksStockColorsForSheetReplaceAction,
  listPartCategoriesForSheetReplaceAction,
  searchPartsForSheetReplaceAction,
  type SheetReplaceCategoryRow,
  type SheetReplaceGobricksStockColor,
  type SheetReplacePartHit,
  type SheetReplacePieceFilter,
} from "@/app/mocs/sheet-row-replace-catalog-action";

export type SheetRowReplaceContext = {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  branch: "fulfillment" | "shortage";
};

type Props = {
  item: ShortageResolveItem;
  context: SheetRowReplaceContext;
  onReplaced: () => void;
  /** 在第一步内展示「推荐替换」，点击后与下方列表一样进入高砖有货选色 */
  showSubstituteSuggestions?: boolean;
};

type Step = "pickPart" | "pickColor";

const PIECE_FILTER_OPTIONS: { id: SheetReplacePieceFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "plain", label: "普通零件" },
  { id: "printed", label: "印刷件" },
];

function substituteRelBadgeLabel(t: "A" | "M"): string {
  return t === "A" ? "替代" : "模具";
}

export function SheetRowReplacePanel({
  item,
  context,
  onReplaced,
  showSubstituteSuggestions = false,
}: Props) {
  const [step, setStep] = useState<Step>("pickPart");
  const [categories, setCategories] = useState<SheetReplaceCategoryRow[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [partCatFilter, setPartCatFilter] = useState<number | "all">("all");
  const [catReady, setCatReady] = useState(false);
  const [pieceFilter, setPieceFilter] = useState<SheetReplacePieceFilter>("all");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [partsHits, setPartsHits] = useState<SheetReplacePartHit[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsError, setPartsError] = useState<string | null>(null);

  const [substituteRows, setSubstituteRows] = useState<PartSubstituteSuggestion[] | null>(null);

  const [pickedPart, setPickedPart] = useState<string | null>(null);
  const [pickedPartName, setPickedPartName] = useState<string>("");

  const [gobricksVariants, setGobricksVariants] = useState<SheetReplaceGobricksStockColor[] | null>(null);
  const [gobricksHint, setGobricksHint] = useState<string | null>(null);
  const [colorId, setColorId] = useState(item.colorId);
  const [colorFilter, setColorFilter] = useState("");
  const [colorsLoadError, setColorsLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const catPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!categoryPickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = catPickerRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setCategoryPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [categoryPickerOpen]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 380);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!showSubstituteSuggestions) {
      setSubstituteRows(null);
      return;
    }
    let cancelled = false;
    setSubstituteRows(null);
    const pn = item.partNum.trim();
    if (!pn) {
      setSubstituteRows([]);
      return;
    }
    void (async () => {
      const res = await getPartSubstituteSuggestionsAction(pn);
      if (cancelled) return;
      if (res.ok) setSubstituteRows(res.items);
      else setSubstituteRows([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [showSubstituteSuggestions, item.partNum]);

  useEffect(() => {
    let cancelled = false;
    setCatalogError(null);
    setCatReady(false);

    void (async () => {
      const [catRes, defRes] = await Promise.all([
        listPartCategoriesForSheetReplaceAction(),
        getDefaultPartCategoryForSheetReplaceAction(item.partNum),
      ]);
      if (cancelled) return;
      if (!catRes.ok) {
        setCatalogError(catRes.error);
        setCatReady(true);
        return;
      }
      setCategories(catRes.categories);
      const defCat = defRes.ok ? defRes.partCatId : null;
      if (defCat != null && catRes.categories.some((c) => c.id === defCat)) {
        setPartCatFilter(defCat);
      } else {
        setPartCatFilter("all");
      }
      setCatReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [item.lineNumber, item.partNum]);

  useEffect(() => {
    if (!catReady) return;
    let cancelled = false;
    setPartsLoading(true);
    setPartsError(null);
    void (async () => {
      const res = await searchPartsForSheetReplaceAction({
        partCatId: partCatFilter,
        q: debouncedSearch,
        pieceFilter,
      });
      if (cancelled) return;
      setPartsLoading(false);
      if (!res.ok) {
        setPartsError(res.error);
        setPartsHits([]);
        return;
      }
      setPartsHits(res.parts);
    })();
    return () => {
      cancelled = true;
    };
  }, [catReady, partCatFilter, debouncedSearch, pieceFilter]);

  const loadGobricksPalette = useCallback(
    async (partNum: string, fallbackPreferredColorId: number) => {
      setColorsLoadError(null);
      setGobricksHint(null);
      setGobricksVariants(null);
      const res = await listGobricksStockColorsForSheetReplaceAction({
        partNum,
        sheetRowPartNum: item.partNum,
        sheetRowGdsItemId: item.gdsItemId ?? null,
        probeLegoColorId: fallbackPreferredColorId,
      });
      if (!res.ok) {
        setColorsLoadError(res.error);
        return;
      }
      setGobricksVariants(res.variants);
      setGobricksHint(res.hint);
      const keep = res.variants.some((c) => c.colorId === fallbackPreferredColorId);
      setColorId(keep ? fallbackPreferredColorId : res.variants[0]!.colorId);
    },
    [item.gdsItemId, item.partNum]
  );

  const goToColorStep = useCallback(
    (partNum: string, partName: string) => {
      setCategoryPickerOpen(false);
      setPickedPart(partNum);
      setPickedPartName(partName);
      setStep("pickColor");
      setColorFilter("");
      void loadGobricksPalette(partNum, item.colorId);
    },
    [item.colorId, loadGobricksPalette]
  );

  const onPickPart = useCallback(
    (hit: SheetReplacePartHit) => {
      goToColorStep(hit.partNum, hit.name);
    },
    [goToColorStep]
  );

  const onPickSubstituteSuggestion = useCallback(
    (s: PartSubstituteSuggestion) => {
      goToColorStep(s.otherPartNum, s.partName ?? "");
    },
    [goToColorStep]
  );

  const filteredVariants = useMemo(() => {
    if (!gobricksVariants) return [];
    const raw = colorFilter.trim().toLowerCase();
    if (!raw) return gobricksVariants;
    const forRgb = raw.replace(/^#/, "");
    return gobricksVariants.filter(
      (c) =>
        c.nameZh.toLowerCase().includes(raw) ||
        c.nameEn.toLowerCase().includes(raw) ||
        c.name.toLowerCase().includes(raw) ||
        c.rgb.toLowerCase().includes(forRgb)
    );
  }, [colorFilter, gobricksVariants]);

  const selectedColorLabel = useMemo(() => {
    if (!gobricksVariants) return null;
    const hit = gobricksVariants.find((c) => c.colorId === colorId);
    if (!hit) return null;
    if (hit.nameZh === hit.nameEn) return hit.nameZh;
    return `${hit.nameZh} · ${hit.nameEn}`;
  }, [colorId, gobricksVariants]);

  const currentCategoryLabel = useMemo(() => {
    if (catalogError) return "无法加载分类";
    if (!catReady) return "加载中…";
    if (partCatFilter === "all") return "全部分类";
    const c = categories?.find((x) => x.id === partCatFilter);
    return c?.name ?? `类型 #${partCatFilter}`;
  }, [catReady, catalogError, partCatFilter, categories]);

  const handleApply = useCallback(async () => {
    const pn = (pickedPart ?? "").trim();
    if (!pn) {
      setActionError("请先选择零件。");
      return;
    }
    setBusy(true);
    setActionError(null);
    const pickedPicture =
      gobricksVariants?.find((c) => c.colorId === colorId)?.picture?.trim() || null;
    const res = await replaceBuildPartsSheetRowAction({
      subjectKind: context.subjectKind,
      subjectId: context.subjectId,
      branch: context.branch,
      lineNumber: item.lineNumber,
      partNum: pn,
      colorId,
      gdsPicture: pickedPicture,
    });
    setBusy(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    onReplaced();
  }, [colorId, context.branch, context.subjectId, context.subjectKind, gobricksVariants, item.lineNumber, onReplaced, pickedPart]);

  const backToParts = useCallback(() => {
    setCategoryPickerOpen(false);
    setStep("pickPart");
    setPickedPart(null);
    setPickedPartName("");
    setGobricksVariants(null);
    setGobricksHint(null);
    setColorsLoadError(null);
    setColorFilter("");
    setActionError(null);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        数量与备注沿用当前行；单价沿用原行；高砖商品图来自下方所选有货颜色。其余高砖字段可再「从高砖同步」刷新。
      </p>

      {step === "pickPart" ? (
        <>
          {showSubstituteSuggestions &&
          substituteRows !== null &&
          substituteRows.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-2)]">
                推荐替换
              </h3>
              <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {substituteRows.map((s) => (
                  <li key={s.otherPartNum}>
                    <button
                      type="button"
                      onClick={() => onPickSubstituteSuggestion(s)}
                      className="flex w-full min-h-0 gap-2.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-2.5 py-2 text-left transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] sm:gap-3 sm:px-3 sm:py-2.5"
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-neutral-300/25 bg-white sm:h-14 sm:w-14">
                        {s.imgUrl ? (
                          <RemoteCoverImage
                            src={s.imgUrl}
                            width={56}
                            height={56}
                            className="h-full w-full object-contain p-0.5 sm:p-1"
                            sizes="56px"
                            fallbackLabel="无图"
                            fallbackClassName="!text-[8px]"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]">
                            无图
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                            {s.otherPartNum}
                          </span>
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
                          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--muted)]">{s.partName}</p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">
              类型与搜索
            </span>
            <div className="flex flex-row items-stretch gap-2 sm:gap-3">
              <div ref={catPickerRef} className="relative max-w-[13.5rem] shrink-0 basis-[40%] sm:basis-[38%]">
                <button
                  type="button"
                  disabled={Boolean(catalogError) || !categories}
                  aria-expanded={categoryPickerOpen}
                  aria-haspopup="listbox"
                  onClick={() => setCategoryPickerOpen((o) => !o)}
                  className="field flex h-10 w-full items-center justify-between gap-2 px-3 text-left text-sm disabled:opacity-45"
                >
                  <span className="min-w-0 truncate text-[var(--text)]">{currentCategoryLabel}</span>
                  <span className="shrink-0 text-[10px] text-[var(--muted-2)]" aria-hidden>
                    {categoryPickerOpen ? "▲" : "▼"}
                  </span>
                </button>
                {categoryPickerOpen ? (
                  <ul
                    className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-[min(50vh,15rem)] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45)]"
                    role="listbox"
                    aria-label="零件类型"
                  >
                    {!categories && !catalogError ? (
                      <li className="px-3 py-4 text-center text-xs text-[var(--muted)]">加载类型…</li>
                    ) : (
                      <>
                        <li>
                          <button
                            type="button"
                            role="option"
                            aria-selected={partCatFilter === "all"}
                            disabled={Boolean(catalogError)}
                            onClick={() => {
                              setPartCatFilter("all");
                              setCategoryPickerOpen(false);
                            }}
                            className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm transition-colors ${
                              partCatFilter === "all"
                                ? "bg-[var(--accent-soft)] text-[var(--text)]"
                                : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                            }`}
                          >
                            <div className="relative size-6 shrink-0 overflow-hidden rounded border border-[var(--border-soft)] bg-[var(--surface-3)]">
                              <span className="flex h-full w-full items-center justify-center text-[7px] font-bold text-[var(--muted)]">
                                全
                              </span>
                            </div>
                            <span className="min-w-0 flex-1 truncate">全部分类</span>
                            {partCatFilter === "all" ? (
                              <span className="shrink-0 text-xs text-[var(--accent)]">✓</span>
                            ) : null}
                          </button>
                        </li>
                        {categories?.map((c) => {
                          const selected = partCatFilter === c.id;
                          return (
                            <li key={c.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setPartCatFilter(c.id);
                                  setCategoryPickerOpen(false);
                                }}
                                className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm transition-colors ${
                                  selected
                                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                                    : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                                }`}
                              >
                                <div className="relative size-6 shrink-0 overflow-hidden rounded border border-[var(--border-soft)] bg-white">
                                  {c.heroImgUrl ? (
                                    <RemoteCoverImage
                                      src={c.heroImgUrl}
                                      fill
                                      className="object-contain p-px"
                                      sizes="24px"
                                      alt=""
                                      fallbackLabel="—"
                                      fallbackClassName="!text-[6px]"
                                    />
                                  ) : (
                                    <span className="flex h-full w-full items-center justify-center text-[6px] text-[var(--muted)]">
                                      —
                                    </span>
                                  )}
                                </div>
                                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                {selected ? (
                                  <span className="shrink-0 text-xs text-[var(--accent)]">✓</span>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </>
                    )}
                  </ul>
                ) : null}
              </div>
              <label className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="sr-only">搜索零件</span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="名称、part_num 或 element_id…"
                  className="field h-10 w-full text-sm"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">
              零件形态
            </span>
            <div className="flex flex-wrap gap-2">
              {PIECE_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={!catReady}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    pieceFilter === opt.id
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                      : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                  } ${!catReady ? "cursor-not-allowed opacity-45" : ""}`}
                  onClick={() => setPieceFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {catalogError ? <p className="text-sm text-amber-200/90">{catalogError}</p> : null}
          {partsError ? <p className="text-sm text-amber-200/90">{partsError}</p> : null}

          <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-2 sm:max-h-[min(60vh,26rem)] sm:p-3">
            {partsLoading && partsHits.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted)]">加载零件列表…</p>
            ) : partsHits.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted)]">无匹配零件，请调整类型或关键词。</p>
            ) : (
              <ul
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5"
                role="list"
              >
                {partsHits.map((hit) => {
                  const isCurrentRow = hit.partNum === item.partNum;
                  return (
                    <li key={hit.partNum}>
                      <button
                        type="button"
                        onClick={() => onPickPart(hit)}
                        className={`flex w-full flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                          isCurrentRow
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]/80 ring-1 ring-[var(--accent)]/50"
                            : "border-[var(--border-soft)] bg-[var(--surface-2)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]"
                        }`}
                      >
                        <div className="relative mx-auto aspect-square w-full max-w-[5.5rem] overflow-hidden rounded-md border border-[var(--border)] bg-white">
                          {hit.imgUrl ? (
                            <RemoteCoverImage
                              src={hit.imgUrl}
                              fill
                              className="object-contain p-1"
                              sizes="(max-width:640px)28vw,5.5rem"
                              fallbackLabel="无图"
                              fallbackClassName="!text-[9px]"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">
                              无图
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                          {hit.partNum}
                        </p>
                        {isCurrentRow ? (
                          <p className="text-center text-[9px] font-medium text-[var(--accent)]">当前行</p>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="text-[11px] text-[var(--muted-2)]">
            列表最多 160 条。
            {partsHits.length > 0 ? `当前 ${partsHits.length} 条。` : null}
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={backToParts}
              className="rounded-full border border-[var(--border-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
            >
              ← 返回选零件
            </button>
          </div>
          <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/80 px-3 py-2.5 text-sm">
            <p className="font-mono text-[13px] font-semibold text-[var(--accent)]">{pickedPart}</p>
            {pickedPartName ? (
              <p className="mt-1 line-clamp-2 text-[var(--muted)]">{pickedPartName}</p>
            ) : null}
          </div>

          <p className="text-xs text-[var(--muted-2)]">点方格选色；悬停可看库存。</p>
          {colorsLoadError ? <p className="text-sm text-amber-200/90">{colorsLoadError}</p> : null}
          {gobricksHint ? (
            <p className="text-xs leading-relaxed text-[var(--muted-2)]">{gobricksHint}</p>
          ) : null}

          {!gobricksVariants ? (
            <p className="text-sm text-[var(--muted)]">加载高砖有货颜色…</p>
          ) : (
            <>
              <div className="text-sm">
                <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">
                  已选颜色
                </span>
                <p className="mt-1 text-[var(--text)]">{selectedColorLabel}</p>
              </div>
              <label className="block text-xs text-[var(--muted)]">
                筛选颜色
                <input
                  type="search"
                  value={colorFilter}
                  onChange={(e) => setColorFilter(e.target.value)}
                  placeholder="中英文名称或 RGB…"
                  className="field mt-1 w-full text-sm"
                  disabled={busy}
                />
              </label>
              <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-2 sm:max-h-[min(60vh,26rem)] sm:p-3">
                {filteredVariants.length === 0 ? (
                  <p className="p-6 text-center text-sm text-[var(--muted)]">无匹配颜色</p>
                ) : (
                  <ul
                    className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5"
                    role="list"
                    aria-label="高砖有货颜色"
                  >
                    {filteredVariants.map((c) => {
                      const sel = c.colorId === colorId;
                      return (
                        <li key={c.colorId}>
                          <button
                            type="button"
                            disabled={busy}
                            title={`${c.nameZh} / ${c.nameEn} · 库存 ${c.inventory.toLocaleString("zh-CN")}`}
                            onClick={() => setColorId(c.colorId)}
                            className={`flex w-full flex-col gap-1 rounded-lg border p-2 text-left transition-colors ${
                              sel
                                ? "border-[var(--accent)] bg-[var(--accent-soft)]/80 ring-1 ring-[var(--accent)]/50"
                                : "border-[var(--border-soft)] bg-[var(--surface-2)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]"
                            }`}
                          >
                            <div className="relative mx-auto aspect-square w-full max-w-[5.5rem] overflow-hidden rounded-md border border-[var(--border)] bg-white">
                              {c.picture ? (
                                <RemoteCoverImage
                                  src={c.picture}
                                  fill
                                  className="object-contain p-1"
                                  sizes="(max-width:640px)28vw,5.5rem"
                                  alt=""
                                  fallbackLabel="无图"
                                  fallbackClassName="!text-[9px]"
                                />
                              ) : c.rgb ? (
                                <span
                                  className="block h-full w-full"
                                  style={{ background: `#${c.rgb}` }}
                                  aria-hidden
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">
                                  无图
                                </span>
                              )}
                            </div>
                            <p className="line-clamp-2 text-center text-[10px] font-medium leading-snug text-[var(--text)] sm:text-[11px]">
                              {c.nameZh}
                            </p>
                            {c.nameEn !== c.nameZh ? (
                              <p className="line-clamp-2 text-center text-[10px] leading-snug text-[var(--muted)] sm:text-[11px]">
                                {c.nameEn}
                              </p>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}

          {actionError ? <p className="text-sm text-amber-200/90">{actionError}</p> : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || !pickedPart || !gobricksVariants?.length}
              onClick={() => void handleApply()}
              className="button-primary text-sm disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存更换"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
