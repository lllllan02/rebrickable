"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import { SheetThumbMismatchOverlay } from "@/components/sheet-thumb-mismatch-overlay";
import type { BuildSubjectKind } from "@/lib/build-subject";
import {
  formatGobricksBilingualColorLabel,
  gobricksCaptionNameOrFallback,
} from "@/lib/gobricks-display-caption";
import { parseGobricksProductIdFromGdsItemId } from "@/lib/gobricks-item-filter-inventory";
import { parseSheetRowReplaceMeta } from "@/lib/sheet-row-replaced-marker";
import {
  resolveGobricksPictureDisplay,
  resolveGobricksThumbDisplay,
  resolveLegoThumbDisplay,
  type SheetRowThumbMismatchKind,
} from "@/lib/parts-sheet-row-thumb";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

import { replaceBuildPartsSheetRowAction } from "@/app/mocs/moc-parts-sheet-actions";
import {
  listGobricksHitsForLegoSubstitutePartsAction,
  listGobricksStockColorsForSheetReplaceAction,
  searchGobricksPartsForSheetReplaceAction,
  type SheetReplaceGobricksSearchHit,
  type SheetReplaceGobricksStockColor,
} from "@/app/mocs/sheet-row-replace-catalog-action";

export type SheetRowReplaceTarget = {
  lineNumber: number;
  ioBatchId?: number;
};

export type SheetRowReplaceContext = {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  branch: "fulfillment" | "shortage";
  /** Studio 分步分包批次；有值时写入 build_io_step_batches 而非主零件表 */
  ioBatchId?: number;
  /** 汇总表等：将展示行映射到单个源分包与行号 */
  resolveReplaceTarget?: (item: ShortageResolveItem) => SheetRowReplaceTarget | null;
  /** 汇总缺件等：同一展示行可能对应多包多行，须依次更换 */
  resolveReplaceTargets?: (item: ShortageResolveItem) => SheetRowReplaceTarget[] | null;
};

export function resolveSheetRowReplaceTarget(
  context: SheetRowReplaceContext,
  item: ShortageResolveItem
): SheetRowReplaceTarget {
  const targets = resolveSheetRowReplaceTargets(context, item);
  return targets[0] ?? { ioBatchId: context.ioBatchId, lineNumber: item.lineNumber };
}

/** 按分包分组、行号降序，避免更换后行号错位 */
export function resolveSheetRowReplaceTargets(
  context: SheetRowReplaceContext,
  item: ShortageResolveItem
): SheetRowReplaceTarget[] {
  const fromMany = context.resolveReplaceTargets?.(item);
  if (fromMany?.length) return sortSheetRowReplaceTargetsForApply(fromMany);

  const one = context.resolveReplaceTarget?.(item);
  if (one) return [one];

  if (context.ioBatchId != null) {
    return [{ ioBatchId: context.ioBatchId, lineNumber: item.lineNumber }];
  }
  return [{ lineNumber: item.lineNumber }];
}

function sortSheetRowReplaceTargetsForApply(
  targets: SheetRowReplaceTarget[]
): SheetRowReplaceTarget[] {
  const byBatch = new Map<number, SheetRowReplaceTarget[]>();
  for (const t of targets) {
    const bid = t.ioBatchId ?? 0;
    const list = byBatch.get(bid) ?? [];
    list.push(t);
    byBatch.set(bid, list);
  }
  const out: SheetRowReplaceTarget[] = [];
  for (const list of byBatch.values()) {
    list.sort((a, b) => b.lineNumber - a.lineNumber);
    out.push(...list);
  }
  return out;
}

type Props = {
  item: ShortageResolveItem;
  context: SheetRowReplaceContext;
  onReplaced: () => void;
};

type Step = "pickPart" | "pickColor";

/** 第一步：高砖方格；`partNum` 为目录设计号；`nameLine` / `idLine` 为展示用名称与编号 */
type QuickPickTile = {
  key: string;
  partNum: string;
  /** 传入选色步与保存 caption 的高砖侧名称（与 API 标题一致，不含「商品」前缀文案） */
  gobricksDisplayName: string;
  nameLine: string;
  idLine: string | null;
  /** 辅文案：乐高设计号 */
  footLine: string;
  imgUrl: string | null;
  imgMismatchKind: SheetRowThumbMismatchKind | null;
  preresolvedProductId: string | null;
  badge: string;
};

const PICK_GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5 md:grid-cols-4 lg:grid-cols-5";

const TILE_NAME_CLASS =
  "line-clamp-2 text-center text-[11px] font-medium leading-snug text-[var(--text)] sm:text-[12px]";
const TILE_ID_CLASS =
  "line-clamp-1 break-all text-center font-mono text-[12px] font-semibold leading-tight text-[#b8e632] sm:text-[13px]";
const TILE_SECONDARY_CLASS =
  "line-clamp-2 text-center text-[11px] leading-snug text-[var(--muted)] sm:text-[12px]";

function LegoReferenceHalfRow({
  imgUrl,
  imgMismatchKind = null,
  partNum,
  partName,
  colorLine,
}: {
  imgUrl: string | null;
  imgMismatchKind?: SheetRowThumbMismatchKind | null;
  partNum: string;
  partName: string | null;
  colorLine: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <div className="relative size-[4.25rem] shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-white sm:size-[4.75rem]">
        {imgUrl ? (
          <RemoteCoverImage
            src={imgUrl}
            fill
            className="object-contain p-1"
            sizes="76px"
            alt=""
            fallbackLabel="无图"
            fallbackClassName="!text-[9px]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]">无图</span>
        )}
        {imgUrl && imgMismatchKind ? <SheetThumbMismatchOverlay kind={imgMismatchKind} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-2)]">参考 · 乐高</div>
        <p className="mt-0.5 font-mono text-[12px] font-semibold leading-tight text-[var(--text)] sm:text-[13px]">{partNum}</p>
        {partName ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--muted)] sm:text-[12px]">{partName}</p>
        ) : null}
        <p className="mt-1 text-[11px] leading-snug text-[var(--muted-2)] sm:text-[12px]">{colorLine}</p>
      </div>
    </div>
  );
}

function buildGobricksQuickTile(
  partNumRaw: string,
  gdsItemId: string | null | undefined,
  caption: string | null | undefined,
  captionEn: string | null | undefined,
  picture: string | null | undefined,
  key: string,
  badge: string,
  /** 用于从旧版 gdsCaption 中剥掉拼接的颜色后缀 */
  legoColorName?: string | null,
  imgMismatchKind?: SheetRowThumbMismatchKind | null
): QuickPickTile | null {
  const partNum = partNumRaw.trim();
  if (!partNum) return null;
  const pid = parseGobricksProductIdFromGdsItemId(gdsItemId ?? null);
  const cap = gobricksCaptionNameOrFallback(caption, captionEn, legoColorName);
  const imgUrl = picture?.trim() || null;
  const gdsTrim = typeof gdsItemId === "string" && gdsItemId.trim() ? gdsItemId.trim() : "";
  const footLine = `乐高 ${partNum}`;

  if (pid != null) {
    const idLine = String(pid);
    const nameLine = cap || "—";
    const gobricksDisplayName = cap || idLine;
    return {
      key,
      partNum,
      gobricksDisplayName,
      nameLine,
      idLine,
      footLine,
      imgUrl,
      imgMismatchKind: imgMismatchKind ?? null,
      preresolvedProductId: pid,
      badge,
    };
  }
  if (imgUrl || cap || gdsTrim) {
    const nameLine = cap || gdsTrim.slice(0, 36) || "高砖";
    const gobricksDisplayName = cap || gdsTrim.slice(0, 120) || partNum;
    return {
      key: `${key}-fallback`,
      partNum,
      gobricksDisplayName,
      nameLine,
      idLine: gdsTrim && !cap ? gdsTrim.slice(0, 36) : null,
      footLine,
      imgUrl,
      imgMismatchKind: imgMismatchKind ?? null,
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
  /** 进入选色步时目录/方格上的商品缩略图（颜色加载前或与变体图互补） */
  const [pickedPartImgUrl, setPickedPartImgUrl] = useState<string | null>(null);

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
    const ocid = replaceMeta.originalColorId;
    if (!op || ocid == null || !Number.isFinite(ocid)) return [];
    const ogThumb = resolveGobricksPictureDisplay(
      replaceMeta.originalGobricksPicture,
      replaceMeta.originalGobricksLegoColorId,
      ocid
    );
    const og = buildGobricksQuickTile(
      op,
      replaceMeta.originalGobricksItemId,
      replaceMeta.originalGobricksCaption,
      replaceMeta.originalGobricksCaptionEn,
      ogThumb.src,
      "before-gobricks",
      "原·高砖",
      replaceMeta.originalColorName,
      ogThumb.mismatchKind
    );
    return og ? [og] : [];
  }, [replaceMeta]);

  const currentRowTiles = useMemo((): QuickPickTile[] => {
    const pn = item.partNum.trim();
    if (!pn) return [];
    const cgThumb = resolveGobricksThumbDisplay(item, context.branch === "fulfillment");
    const cg = buildGobricksQuickTile(
      pn,
      item.gdsItemId,
      item.gdsCaption,
      item.gdsCaptionEn,
      cgThumb.src,
      "current-gobricks",
      "现·高砖",
      item.colorName,
      cgThumb.mismatchKind
    );
    return cg ? [cg] : [];
  }, [
    context.branch,
    item.colorId,
    item.colorName,
    item.partNum,
    item.gdsItemId,
    item.gdsCaption,
    item.gdsCaptionEn,
    item.gdsPicture,
    item.gdsLegoColorId,
  ]);

  /** 选高砖色时对照：配货表本行对应的乐高颜色名（已更换行优先用标记里存档的原色） */
  const legoReferenceColorLine = useMemo(() => {
    if (
      replaceMeta.hasMarker &&
      replaceMeta.originalColorId != null &&
      Number.isFinite(replaceMeta.originalColorId)
    ) {
      const id = replaceMeta.originalColorId;
      const name = replaceMeta.originalColorName?.trim();
      return name ? `${name}（${id}）` : `色 ID ${id}`;
    }
    const id = item.colorId;
    const name = item.colorName?.trim();
    return name ? `${name}（${id}）` : `色 ID ${id}`;
  }, [
    replaceMeta.hasMarker,
    replaceMeta.originalColorId,
    replaceMeta.originalColorName,
    item.colorId,
    item.colorName,
  ]);

  const legoReferenceThumb = useMemo(() => {
    if (
      replaceMeta.hasMarker &&
      replaceMeta.originalColorId != null &&
      Number.isFinite(replaceMeta.originalColorId)
    ) {
      const snap = replaceMeta.originalLegoImgUrl?.trim();
      if (snap) {
        return { src: snap, mismatchKind: null as SheetRowThumbMismatchKind | null };
      }
    }
    const d = resolveLegoThumbDisplay(item);
    return { src: d.src, mismatchKind: d.mismatchKind };
  }, [
    replaceMeta.hasMarker,
    replaceMeta.originalColorId,
    replaceMeta.originalLegoImgUrl,
    item,
  ]);

  const legoReferencePartNum = useMemo(() => {
    if (replaceMeta.hasMarker) {
      const op = replaceMeta.originalPartNum?.trim();
      if (op) return op;
    }
    return item.partNum.trim() || "—";
  }, [replaceMeta.hasMarker, replaceMeta.originalPartNum, item.partNum]);

  const legoReferencePartName = useMemo(() => {
    if (replaceMeta.hasMarker) {
      const n = replaceMeta.originalLegoPartName?.trim();
      if (n) return n;
    }
    return item.partName?.trim() || null;
  }, [replaceMeta.hasMarker, replaceMeta.originalLegoPartName, item.partName]);

  const selectedGobricksVariant = useMemo(
    () => gobricksVariants?.find((c) => c.colorId === colorId) ?? null,
    [colorId, gobricksVariants]
  );

  const pickedGobricksThumb = useMemo(() => {
    const variantPic = selectedGobricksVariant?.picture?.trim() || null;
    const rgb = selectedGobricksVariant?.rgb?.trim() || null;
    if (variantPic) {
      return { picture: variantPic, rgb, mismatchKind: null as SheetRowThumbMismatchKind | null };
    }
    const fallback = pickedPartImgUrl?.trim() || null;
    return {
      picture: fallback,
      rgb,
      mismatchKind: fallback ? ("gds" as const) : null,
    };
  }, [pickedPartImgUrl, selectedGobricksVariant]);

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
    (partNum: string, partName: string, productId: string | null, catalogImgUrl: string | null) => {
      setPickedPart(partNum);
      setPickedPartName(partName);
      setPickedPartImgUrl(catalogImgUrl?.trim() || null);
      setStep("pickColor");
      setColorFilter("");
      void loadGobricksPalette(partNum, item.colorId, productId);
    },
    [item.colorId, loadGobricksPalette]
  );

  const onPickPart = useCallback(
    (hit: SheetReplaceGobricksSearchHit) => {
      goToColorStep(hit.partNum, hit.name, hit.productId, hit.imgUrl);
    },
    [goToColorStep]
  );

  const onPickQuickTile = useCallback(
    (t: QuickPickTile) => {
      goToColorStep(t.partNum, t.gobricksDisplayName, t.preresolvedProductId, t.imgUrl);
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
    return formatGobricksBilingualColorLabel({ nameZh: hit.nameZh, nameEn: hit.nameEn });
  }, [colorId, gobricksVariants]);

  const canSaveReplace =
    Boolean(pickedPart?.trim()) && Boolean(gobricksVariants?.length) && !busy;

  const saveReplaceDisabledReason = useMemo(() => {
    if (busy) return null;
    if (!pickedPart?.trim()) return "请先选择零件并进入选色。";
    if (colorsLoadError) return colorsLoadError;
    if (!gobricksVariants) return "正在加载有货颜色…";
    if (gobricksVariants.length === 0) return "高砖未返回可选颜色，无法保存。";
    return null;
  }, [busy, colorsLoadError, gobricksVariants, pickedPart]);

  const handleApply = useCallback(async () => {
    const pn = (pickedPart ?? "").trim();
    if (!pn) {
      setActionError("请先选择零件。");
      return;
    }
    if (!gobricksVariants?.length) {
      setActionError(saveReplaceDisabledReason ?? "请先选择有货颜色。");
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const hit = gobricksVariants.find((c) => c.colorId === colorId);
      const pickedPicture = hit?.picture?.trim() || null;
      const targets = resolveSheetRowReplaceTargets(context, item);
      const replacePayload = {
        subjectKind: context.subjectKind,
        subjectId: context.subjectId,
        branch: context.branch,
        partNum: pn,
        colorId,
        gdsPicture: pickedPicture,
        gdsItemId: hit?.gdsItemId ?? null,
        gdsColorId: hit?.gdsColorId ?? null,
        gdsCaption: pickedPartName.trim() || null,
        gdsLegoColorId: String(colorId),
        gdsColorNameZh: hit?.nameZh ?? null,
        gdsColorNameEn: hit?.nameEn ?? null,
        gdsUnitPrice: hit?.gdsUnitPrice ?? null,
      };
      for (const target of targets) {
        const res = await replaceBuildPartsSheetRowAction({
          ...replacePayload,
          ioBatchId: target.ioBatchId,
          lineNumber: target.lineNumber,
        });
        if (!res.ok) {
          setActionError(res.error);
          return;
        }
      }
      onReplaced();
    } catch {
      setActionError("保存失败，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }, [
    colorId,
    context,
    gobricksVariants,
    item,
    onReplaced,
    pickedPart,
    pickedPartName,
    saveReplaceDisabledReason,
  ]);

  const backToParts = useCallback(() => {
    setStep("pickPart");
    setPickedPart(null);
    setPickedPartName("");
    setPickedPartImgUrl(null);
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
                {t.imgUrl && t.imgMismatchKind ? (
                  <SheetThumbMismatchOverlay kind={t.imgMismatchKind} />
                ) : null}
                <span className="pointer-events-none absolute left-0.5 top-0.5 z-[3] rounded border border-amber-400/40 bg-amber-700/90 px-1 py-px text-[8px] font-medium leading-none text-amber-50">
                  {t.badge}
                </span>
              </div>
              <p className={TILE_NAME_CLASS}>{t.nameLine}</p>
              {t.idLine ? <p className={TILE_ID_CLASS}>{t.idLine}</p> : null}
              <p className={TILE_SECONDARY_CLASS}>{t.footLine}</p>
              {accent ? (
                <p className="text-center text-[10px] font-medium text-[var(--accent)] sm:text-[11px]">当前行</p>
              ) : null}
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
              <p className={TILE_NAME_CLASS}>{hit.name}</p>
              <p className={TILE_ID_CLASS}>{hit.productId}</p>
              <p className={TILE_SECONDARY_CLASS}>乐高 {hit.partNum}</p>
              {isCurrentRow ? (
                <p className="text-center text-[10px] font-medium text-[var(--accent)] sm:text-[11px]">当前行</p>
              ) : null}
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
    <div className="flex min-h-0 flex-1 flex-col">
      {step === "pickPart" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <p className="shrink-0 text-xs text-[var(--muted)]">数量、备注与单价沿用本行；选有货颜色后保存。</p>
          <div
            className="shrink-0 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/80 p-2.5 sm:p-3"
            role="region"
            aria-label="本行乐高零件参考"
          >
            <LegoReferenceHalfRow
              imgUrl={legoReferenceThumb.src}
              imgMismatchKind={legoReferenceThumb.mismatchKind}
              partNum={legoReferencePartNum}
              partName={legoReferencePartName}
              colorLine={legoReferenceColorLine}
            />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-3 sm:p-4">
            {beforeReplaceTiles.length > 0 ? (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">原 · 高砖</h3>
                {renderQuickTiles(beforeReplaceTiles)}
              </section>
            ) : null}

            {currentRowTiles.length > 0 ? (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">现 · 高砖</h3>
                {renderQuickTiles(currentRowTiles)}
              </section>
            ) : null}

            <section className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">推荐 · 高砖</h3>
              {legoSubstituteLoading ? (
                <p className="py-3 text-center text-sm text-[var(--muted)]">加载推荐…</p>
              ) : legoSubstituteHits.length === 0 ? (
                <p className="py-2 text-center text-xs text-[var(--muted)]">无推荐或高砖无匹配</p>
              ) : legoSubstituteHitsDeduped.length === 0 ? (
                <p className="py-2 text-center text-xs text-[var(--muted)]">与上方重复，已省略</p>
              ) : (
                renderSearchHits(legoSubstituteHitsDeduped)
              )}
            </section>

            <div className="space-y-1.5 border-t border-[var(--border-soft)] pt-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-2)]">搜索</span>
              <label className="block">
                <span className="sr-only">搜索高砖</span>
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="编号、名称或关键词…"
                  className="field h-10 w-full text-sm"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            </div>

            {partsError ? <p className="text-sm text-amber-200/90">{partsError}</p> : null}

            {debouncedSearch.trim() && partsLoading && partsHits.length === 0 ? (
              <p className="py-3 text-center text-sm text-[var(--muted)]">搜索中…</p>
            ) : null}

            {debouncedSearch.trim() && !partsLoading && partsHits.length === 0 && !partsError ? (
              <p className="py-2 text-center text-xs text-[var(--muted)]">无匹配</p>
            ) : null}

            {partsHitsDeduped.length > 0 ? (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-2)]">搜索 · 高砖</h3>
                {renderSearchHits(partsHitsDeduped)}
              </section>
            ) : null}

            {pickSummaryEmpty ? (
              <p className="py-5 text-center text-sm text-[var(--muted)]">请使用上方搜索</p>
            ) : null}
          </div>

          {(legoSubstituteHitsDeduped.length > 0 || partsHitsDeduped.length > 0) ? (
            <p className="shrink-0 text-[10px] text-[var(--muted-2)]">
              推荐 {legoSubstituteHitsDeduped.length} 条 · 搜索 {partsHitsDeduped.length} 条
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <div
            className="flex shrink-0 items-stretch gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/80 p-2.5 sm:gap-3 sm:p-3"
            role="region"
            aria-label="乐高参考与选中高砖零件"
          >
            <LegoReferenceHalfRow
              imgUrl={legoReferenceThumb.src}
              imgMismatchKind={legoReferenceThumb.mismatchKind}
              partNum={legoReferencePartNum}
              partName={legoReferencePartName}
              colorLine={legoReferenceColorLine}
            />

            <div className="w-px shrink-0 self-stretch bg-[var(--border-soft)]" aria-hidden />

            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="relative size-[4.25rem] shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-white sm:size-[4.75rem]">
                {pickedGobricksThumb.picture ? (
                  <RemoteCoverImage
                    src={pickedGobricksThumb.picture}
                    fill
                    className="object-contain p-1"
                    sizes="76px"
                    alt=""
                    fallbackLabel="无图"
                    fallbackClassName="!text-[9px]"
                  />
                ) : pickedGobricksThumb.rgb ? (
                  <span
                    className="block h-full w-full"
                    style={{ background: `#${pickedGobricksThumb.rgb}` }}
                    aria-hidden
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]">无图</span>
                )}
                {pickedGobricksThumb.picture && pickedGobricksThumb.mismatchKind ? (
                  <SheetThumbMismatchOverlay kind={pickedGobricksThumb.mismatchKind} />
                ) : null}
              </div>
              <div className="min-w-0 flex-1 text-sm">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-2)]">选中 · 高砖</div>
                <p className="mt-0.5 font-mono text-[12px] font-semibold leading-tight text-[var(--accent)] sm:text-[13px]">
                  {pickedPart}
                </p>
                {pickedPartName ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[var(--text)] sm:text-[12px]">
                    {pickedPartName}
                  </p>
                ) : null}
                {gobricksVariants && selectedColorLabel ? (
                  <p className="mt-1 text-[11px] leading-snug text-[var(--muted-2)] sm:text-[12px]">
                    {selectedColorLabel}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {colorsLoadError ? <p className="shrink-0 text-sm text-amber-200/90">{colorsLoadError}</p> : null}
          {gobricksHint ? <p className="shrink-0 text-[11px] text-[var(--muted-2)]">{gobricksHint}</p> : null}

          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {!gobricksVariants ? (
              <p className="shrink-0 text-sm text-[var(--muted)]">加载颜色…</p>
            ) : (
              <>
                <label className="shrink-0 block">
                  <span className="sr-only">筛选颜色</span>
                  <input
                    type="search"
                    value={colorFilter}
                    onChange={(e) => setColorFilter(e.target.value)}
                    placeholder="筛选名称或 RGB…"
                    className="field w-full text-sm"
                    disabled={busy}
                  />
                </label>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-2 sm:p-3">
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
                                <p className="line-clamp-3 text-center text-[11px] font-medium leading-snug text-[var(--text)] sm:text-[12px]">
                                  {formatGobricksBilingualColorLabel({
                                    nameZh: c.nameZh,
                                    nameEn: c.nameEn,
                                  })}
                                </p>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div
            className="relative z-10 shrink-0 border-t border-[var(--border-soft)] bg-[var(--surface)]/95 px-0 pt-2 shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.12)] backdrop-blur-md [-webkit-backdrop-filter:blur(8px)]"
            style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom, 0px))" }}
            role="toolbar"
            aria-label="选色操作"
          >
            {actionError ? (
              <p className="mb-2 text-sm text-amber-200/90" role="alert">
                {actionError}
              </p>
            ) : saveReplaceDisabledReason && !canSaveReplace ? (
              <p className="mb-2 text-[11px] leading-snug text-[var(--muted-2)]">{saveReplaceDisabledReason}</p>
            ) : null}
            <div className="flex w-full items-center justify-between gap-2">
              <button
                type="button"
                onClick={backToParts}
                className="rounded-full border border-[var(--border-soft)] px-2.5 py-1 text-[11px] font-medium leading-tight text-[var(--text)] shadow-sm hover:bg-[var(--surface-2)] sm:px-3 sm:text-xs"
              >
                ← 返回选零件
              </button>
              <button
                type="button"
                disabled={!canSaveReplace}
                onClick={() => void handleApply()}
                className="button-primary !px-3 !py-1.5 text-xs font-extrabold leading-tight disabled:opacity-50 sm:!py-2 sm:text-sm"
              >
                {busy ? "保存中…" : "保存更换"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
