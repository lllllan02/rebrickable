"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import type { BuildSubjectKind } from "@/lib/build-subject";
import { parseGobricksProductIdFromGdsItemId } from "@/lib/gobricks-item-filter-inventory";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

import { replaceBuildPartsSheetRowAction } from "@/app/mocs/moc-parts-sheet-actions";
import {
  listGobricksHitsForLegoSubstitutePartsAction,
  listGobricksStockColorsForSheetReplaceAction,
  searchGobricksPartsForSheetReplaceAction,
  type SheetReplaceGobricksSearchHit,
  type SheetReplaceGobricksStockColor,
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
};

type Step = "pickPart" | "pickColor";

export function SheetRowReplacePanel({ item, context, onReplaced }: Props) {
  const [step, setStep] = useState<Step>("pickPart");

  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [partsHits, setPartsHits] = useState<SheetReplaceGobricksSearchHit[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsError, setPartsError] = useState<string | null>(null);

  const [legoSubstituteHits, setLegoSubstituteHits] = useState<SheetReplaceGobricksSearchHit[]>([]);
  const [legoSubstituteLoading, setLegoSubstituteLoading] = useState(false);

  const [pickedPart, setPickedPart] = useState<string | null>(null);
  const [pickedPartName, setPickedPartName] = useState<string>("");

  const [gobricksVariants, setGobricksVariants] = useState<SheetReplaceGobricksStockColor[] | null>(null);
  const [gobricksHint, setGobricksHint] = useState<string | null>(null);
  const [colorId, setColorId] = useState(item.colorId);
  const [colorFilter, setColorFilter] = useState("");
  const [colorsLoadError, setColorsLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 380);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLegoSubstituteHits([]);
    setLegoSubstituteLoading(true);
    void (async () => {
      const res = await listGobricksHitsForLegoSubstitutePartsAction({ legoPartNum: item.partNum });
      if (cancelled) return;
      setLegoSubstituteLoading(false);
      if (res.ok) setLegoSubstituteHits(res.parts);
      else setLegoSubstituteHits([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [item.partNum, item.lineNumber]);

  useEffect(() => {
    let cancelled = false;
    const q = debouncedSearch.trim();
    if (!q) {
      setPartsLoading(false);
      setPartsError(null);
      setPartsHits([]);
      return;
    }
    setPartsLoading(true);
    setPartsError(null);
    void (async () => {
      const res = await searchGobricksPartsForSheetReplaceAction({ q });
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
  }, [debouncedSearch]);

  const substituteProductIds = useMemo(
    () => new Set(legoSubstituteHits.map((h) => h.productId)),
    [legoSubstituteHits]
  );

  const displayHits = useMemo(() => {
    const seen = new Set<string>();
    const out: SheetReplaceGobricksSearchHit[] = [];
    for (const h of legoSubstituteHits) {
      if (seen.has(h.productId)) continue;
      seen.add(h.productId);
      out.push(h);
    }
    for (const h of partsHits) {
      if (seen.has(h.productId)) continue;
      seen.add(h.productId);
      out.push(h);
    }
    return out;
  }, [legoSubstituteHits, partsHits]);

  const loadGobricksPalette = useCallback(
    async (partNum: string, fallbackPreferredColorId: number, preresolvedProductId: string | null) => {
      setColorsLoadError(null);
      setGobricksHint(null);
      setGobricksVariants(null);
      const res = await listGobricksStockColorsForSheetReplaceAction({
        partNum,
        sheetRowPartNum: item.partNum,
        sheetRowGdsItemId: item.gdsItemId ?? null,
        probeLegoColorId: fallbackPreferredColorId,
        preresolvedProductId,
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
    (partNum: string, partName: string, productId: string | null) => {
      setPickedPart(partNum);
      setPickedPartName(partName);
      setStep("pickColor");
      setColorFilter("");
      void loadGobricksPalette(partNum, item.colorId, productId);
    },
    [item.colorId, loadGobricksPalette]
  );

  const onPickPart = useCallback(
    (hit: SheetReplaceGobricksSearchHit) => {
      goToColorStep(hit.partNum, hit.name, hit.productId);
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

  const handleApply = useCallback(async () => {
    const pn = (pickedPart ?? "").trim();
    if (!pn) {
      setActionError("请先选择零件。");
      return;
    }
    setBusy(true);
    setActionError(null);
    const hit = gobricksVariants?.find((c) => c.colorId === colorId);
    const pickedPicture = hit?.picture?.trim() || null;
    const labelLine = [pickedPartName.trim(), selectedColorLabel].filter(Boolean).join(" / ");
    const res = await replaceBuildPartsSheetRowAction({
      subjectKind: context.subjectKind,
      subjectId: context.subjectId,
      branch: context.branch,
      lineNumber: item.lineNumber,
      partNum: pn,
      colorId,
      gdsPicture: pickedPicture,
      gdsItemId: hit?.gdsItemId ?? null,
      gdsColorId: hit?.gdsColorId ?? null,
      gdsCaption: labelLine || null,
      gdsLegoColorId: String(colorId),
    });
    setBusy(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    onReplaced();
  }, [
    colorId,
    context.branch,
    context.subjectId,
    context.subjectKind,
    gobricksVariants,
    item.lineNumber,
    onReplaced,
    pickedPart,
    pickedPartName,
    selectedColorLabel,
  ]);

  const backToParts = useCallback(() => {
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
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">
              高砖商城搜索
            </span>
            <label className="block">
              <span className="sr-only">搜索高砖商品</span>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="乐高零件号、中文商品名或关键词…"
                className="field h-10 w-full text-sm"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>

          {partsError ? <p className="text-sm text-amber-200/90">{partsError}</p> : null}

          <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-contain rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-2 sm:max-h-[min(60vh,26rem)] sm:p-3">
            {legoSubstituteLoading && displayHits.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted)]">
                正在按乐高目录 A/M 推荐零件号查询高砖…
              </p>
            ) : !debouncedSearch.trim() && displayHits.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted)]">
                本地目录无 A/M 推荐替换，或高砖暂无匹配；可输入关键词再搜高砖商品。选中商品后再选有货颜色。
              </p>
            ) : debouncedSearch.trim() && partsLoading && displayHits.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted)]">搜索高砖商品中…</p>
            ) : displayHits.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--muted)]">无匹配商品，请尝试其它关键词或更完整的零件号。</p>
            ) : (
              <ul
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5"
                role="list"
              >
                {displayHits.map((hit) => {
                  const sheetPid = parseGobricksProductIdFromGdsItemId(item.gdsItemId ?? null);
                  const isCurrentRow =
                    hit.partNum === item.partNum && (sheetPid == null || hit.productId === sheetPid);
                  const isLegoSubstitute = substituteProductIds.has(hit.productId);
                  return (
                    <li key={`${hit.productId}-${hit.partNum}`}>
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
                          {isLegoSubstitute ? (
                            <span className="pointer-events-none absolute left-0.5 top-0.5 rounded border border-emerald-400/35 bg-emerald-500/85 px-1 py-px text-[8px] font-medium leading-none text-emerald-50">
                              乐高推荐
                            </span>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                          {hit.partNum}
                        </p>
                        <p className="line-clamp-2 text-center text-[9px] leading-snug text-[var(--muted)]">{hit.name}</p>
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
            列表最多 160 条/次搜索；乐高 A/M 推荐最多预查 {16} 个零件号，结果置顶并去重。
            {displayHits.length > 0 ? `当前展示 ${displayHits.length} 条。` : null}
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
