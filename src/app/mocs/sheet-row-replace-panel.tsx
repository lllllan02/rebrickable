"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import type { BuildSubjectKind } from "@/lib/build-subject";
import { parseGobricksProductIdFromGdsItemId } from "@/lib/gobricks-item-filter-inventory";
import { parseSheetRowReplaceMeta } from "@/lib/sheet-row-replaced-marker";
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

/** 第一步：高砖商品方格；`partNum` 为内部解析用乐高设计号，主文案用 `primaryLine` 展示高砖侧信息 */
type QuickPickTile = {
  key: string;
  partNum: string;
  primaryLine: string;
  subtitle: string;
  imgUrl: string | null;
  preresolvedProductId: string | null;
  badge: string;
};

const PICK_GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5";

function buildGobricksQuickTile(
  partNumRaw: string,
  gdsItemId: string | null | undefined,
  caption: string | null | undefined,
  captionEn: string | null | undefined,
  picture: string | null | undefined,
  key: string,
  badge: string
): QuickPickTile | null {
  const partNum = partNumRaw.trim();
  if (!partNum) return null;
  const pid = parseGobricksProductIdFromGdsItemId(gdsItemId ?? null);
  const cap = caption?.trim() || captionEn?.trim() || "";
  const imgUrl = picture?.trim() || null;
  const gdsTrim = typeof gdsItemId === "string" && gdsItemId.trim() ? gdsItemId.trim() : "";
  const primaryLine = pid ? `商品 ${pid}` : gdsTrim ? gdsTrim.slice(0, 36) : "高砖";
  if (pid) {
    return {
      key,
      partNum,
      primaryLine,
      subtitle: cap || `高砖商品 · ${pid}`,
      imgUrl,
      preresolvedProductId: pid,
      badge,
    };
  }
  if (imgUrl || cap) {
    return {
      key: `${key}-fallback`,
      partNum,
      primaryLine,
      subtitle: cap || "颜色未匹配等，将按目录解析高砖商品",
      imgUrl,
      preresolvedProductId: null,
      badge,
    };
  }
  return null;
}

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

  const replaceMeta = useMemo(() => parseSheetRowReplaceMeta(item.rest), [item.rest]);

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

  const beforeReplaceTiles = useMemo((): QuickPickTile[] => {
    if (!replaceMeta.hasMarker) return [];
    const op = replaceMeta.originalPartNum?.trim();
    if (!op) return [];
    const og = buildGobricksQuickTile(
      op,
      replaceMeta.originalGobricksItemId,
      replaceMeta.originalGobricksCaption,
      null,
      replaceMeta.originalGobricksPicture,
      "before-gobricks",
      "原·高砖"
    );
    return og ? [og] : [];
  }, [replaceMeta]);

  const currentRowTiles = useMemo((): QuickPickTile[] => {
    const pn = item.partNum.trim();
    if (!pn) return [];
    const cg = buildGobricksQuickTile(
      pn,
      item.gdsItemId,
      item.gdsCaption,
      item.gdsCaptionEn,
      item.gdsPicture,
      "current-gobricks",
      "现·高砖"
    );
    return cg ? [cg] : [];
  }, [item.partNum, item.gdsItemId, item.gdsCaption, item.gdsCaptionEn, item.gdsPicture]);

  const quickPickProductIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of [...beforeReplaceTiles, ...currentRowTiles]) {
      if (t.preresolvedProductId) s.add(t.preresolvedProductId);
    }
    return s;
  }, [beforeReplaceTiles, currentRowTiles]);

  const substituteProductIds = useMemo(
    () => new Set(legoSubstituteHits.map((h) => h.productId)),
    [legoSubstituteHits]
  );

  const sheetPid = useMemo(() => parseGobricksProductIdFromGdsItemId(item.gdsItemId ?? null), [item.gdsItemId]);

  const legoSubstituteHitsDeduped = useMemo(
    () => legoSubstituteHits.filter((h) => !quickPickProductIds.has(h.productId)),
    [legoSubstituteHits, quickPickProductIds]
  );

  const substitutePidSetForSearchDedupe = useMemo(
    () => new Set(legoSubstituteHitsDeduped.map((h) => h.productId)),
    [legoSubstituteHitsDeduped]
  );

  const partsHitsDeduped = useMemo(
    () =>
      partsHits.filter(
        (h) => !quickPickProductIds.has(h.productId) && !substitutePidSetForSearchDedupe.has(h.productId)
      ),
    [partsHits, quickPickProductIds, substitutePidSetForSearchDedupe]
  );

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

  const onPickQuickTile = useCallback(
    (t: QuickPickTile) => {
      goToColorStep(t.partNum, t.subtitle, t.preresolvedProductId);
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

  const quickAccent = useCallback(
    (t: QuickPickTile) => {
      if (t.badge !== "现·高砖") return false;
      if (t.preresolvedProductId && sheetPid && t.partNum === item.partNum.trim() && t.preresolvedProductId === sheetPid) {
        return true;
      }
      if (t.key.startsWith("current-gobricks") && t.partNum === item.partNum.trim()) return true;
      return false;
    },
    [item.partNum, sheetPid]
  );

  const renderQuickTiles = (tiles: QuickPickTile[]) => (
    <ul className={PICK_GRID} role="list">
      {tiles.map((t) => {
        const accent = quickAccent(t);
        return (
          <li key={t.key}>
            <button
              type="button"
              title={`目录设计号 ${t.partNum}`}
              onClick={() => onPickQuickTile(t)}
              className={`flex w-full flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                accent
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]/80 ring-1 ring-[var(--accent)]/50"
                  : "border-[var(--border-soft)] bg-[var(--surface-2)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface)]"
              }`}
            >
              <div className="relative mx-auto aspect-square w-full max-w-[5.5rem] overflow-hidden rounded-md border border-[var(--border)] bg-white">
                {t.imgUrl ? (
                  <RemoteCoverImage
                    src={t.imgUrl}
                    fill
                    className="object-contain p-1"
                    sizes="(max-width:640px)28vw,5.5rem"
                    fallbackLabel="无图"
                    fallbackClassName="!text-[9px]"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">无图</span>
                )}
                <span className="pointer-events-none absolute left-0.5 top-0.5 rounded border border-amber-400/40 bg-amber-700/90 px-1 py-px text-[8px] font-medium leading-none text-amber-50">
                  {t.badge}
                </span>
              </div>
              <p className="line-clamp-2 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                {t.primaryLine}
              </p>
              <p className="line-clamp-2 text-center text-[9px] leading-snug text-[var(--muted)]">{t.subtitle}</p>
              {accent ? <p className="text-center text-[9px] font-medium text-[var(--accent)]">当前行</p> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const renderSearchHits = (hits: SheetReplaceGobricksSearchHit[]) => (
    <ul className={PICK_GRID} role="list">
      {hits.map((hit) => {
        const isCurrentRow =
          hit.partNum === item.partNum.trim() && (sheetPid == null || hit.productId === sheetPid);
        const isLegoSubstitute = substituteProductIds.has(hit.productId);
        return (
          <li key={`${hit.productId}-${hit.partNum}`}>
            <button
              type="button"
              title={`目录设计号 ${hit.partNum}`}
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
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">无图</span>
                )}
                {isLegoSubstitute ? (
                  <span className="pointer-events-none absolute left-0.5 top-0.5 rounded border border-emerald-400/35 bg-emerald-500/85 px-1 py-px text-[8px] font-medium leading-none text-emerald-50">
                    推荐
                  </span>
                ) : null}
              </div>
              <p className="line-clamp-2 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                商品 {hit.productId}
              </p>
              <p className="line-clamp-2 text-center text-[9px] leading-snug text-[var(--muted)]">{hit.name}</p>
              {isCurrentRow ? <p className="text-center text-[9px] font-medium text-[var(--accent)]">当前行</p> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const pickSummaryEmpty =
    currentRowTiles.length === 0 &&
    beforeReplaceTiles.length === 0 &&
    !legoSubstituteLoading &&
    legoSubstituteHits.length === 0 &&
    !debouncedSearch.trim() &&
    !partsLoading &&
    partsHits.length === 0 &&
    !partsError;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        数量与备注沿用当前行；单价沿用原行；高砖商品图来自下方所选有货颜色。其余高砖字段可再「从高砖同步」刷新。
      </p>

      {step === "pickPart" ? (
        <>
          <div className="max-h-[min(64vh,32rem)] space-y-5 overflow-y-auto overscroll-contain rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-3 sm:max-h-[min(70vh,36rem)] sm:p-4">
            {beforeReplaceTiles.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">原 · 高砖</h3>
                <p className="text-[11px] leading-relaxed text-[var(--muted-2)]">
                  本行曾手动更换过零件；以下为存档中的原高砖商品（若有），可点选后仅换色或改选其它 SKU。
                </p>
                {renderQuickTiles(beforeReplaceTiles)}
              </section>
            ) : null}

            {currentRowTiles.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">现 · 高砖</h3>
                <p className="text-[11px] leading-relaxed text-[var(--muted-2)]">
                  本行已同步的高砖商品（含颜色未匹配等仅有图/标题、SKU 非标准时仍可点选，由后台按目录解析）。
                </p>
                {renderQuickTiles(currentRowTiles)}
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">推荐 · 高砖</h3>
              {legoSubstituteLoading ? (
                <p className="py-4 text-center text-sm text-[var(--muted)]">正在按目录 A/M 关联查询高砖商品…</p>
              ) : legoSubstituteHits.length === 0 ? (
                <p className="py-2 text-center text-[11px] leading-relaxed text-[var(--muted)]">
                  本地目录无替代 / 模具变体记录，或高砖暂无匹配。
                </p>
              ) : legoSubstituteHitsDeduped.length === 0 ? (
                <p className="py-2 text-center text-[11px] leading-relaxed text-[var(--muted)]">
                  推荐商品与上方快速区重复已全部隐藏。
                </p>
              ) : (
                renderSearchHits(legoSubstituteHitsDeduped)
              )}
            </section>

            <div className="space-y-1.5 border-t border-[var(--border-soft)] pt-4">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">高砖商城搜索</span>
              <label className="block">
                <span className="sr-only">搜索高砖商品</span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="商品号、名称或关键词…"
                  className="field h-10 w-full text-sm"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            </div>

            {partsError ? <p className="text-sm text-amber-200/90">{partsError}</p> : null}

            {debouncedSearch.trim() && partsLoading && partsHits.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--muted)]">搜索高砖商品中…</p>
            ) : null}

            {debouncedSearch.trim() && !partsLoading && partsHits.length === 0 && !partsError ? (
              <p className="py-3 text-center text-sm text-[var(--muted)]">无匹配商品，请尝试其它关键词。</p>
            ) : null}

            {partsHitsDeduped.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">搜索 · 高砖</h3>
                {renderSearchHits(partsHitsDeduped)}
              </section>
            ) : null}

            {pickSummaryEmpty ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">暂无可用选项，请尝试上方搜索。</p>
            ) : null}
          </div>

          <p className="text-[11px] text-[var(--muted-2)]">
            分区：原/现/推荐高砖与站内搜索；与「原」「现」重复的 <span className="font-mono">product_id</span>{" "}
            在推荐与搜索列表中隐藏。单次搜索最多 160 条。卡片悬停可看目录设计号。
            {legoSubstituteHitsDeduped.length + partsHitsDeduped.length > 0
              ? `推荐 ${legoSubstituteHitsDeduped.length} 条 · 搜索 ${partsHitsDeduped.length} 条。`
              : null}
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
                    className={PICK_GRID}
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
