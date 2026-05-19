import {
  aggregateBomForGobricks,
  bomToGobricksTestList,
  buildLegoDesignColorToGobricksSkuMap,
  fetchGobricksLego2MergedPayload,
  gobricksBomSkuDisplayLabel,
  gobricksBomSkuKeyFromGds,
} from "@/lib/gobricks-lego2-item-list";
import { legoMechanicalPartKey } from "@/lib/lego-mechanical-part-key";
import {
  legoBomAliasKeys,
  partNumsCanPairViaSubstitute,
  substitutePartNumsForItem,
} from "@/lib/lego-bom-compare-alias";
import { buildPartSubstituteClosure } from "@/lib/part-substitute-closure";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type PartsSheetBomLine = {
  partNum: string;
  colorId: number;
  quantity: number;
  colorName: string | null;
  elementId: string | null;
};

export type PartsSheetBomDiffRow = {
  /** LEGO element_id（同 SKU 多 element 时用逗号拼接） */
  elementId: string | null;
  partNum: string;
  partName: string | null;
  colorId: number;
  colorName: string | null;
  ioQty: number;
  mocQty: number;
};

export type PartsSheetBomCompareSummary = {
  match: boolean;
  ioLineCount: number;
  mocLineCount: number;
  ioTotalQty: number;
  mocTotalQty: number;
  /** 仅在 IO 中的 identity 行数 */
  onlyInIoCount: number;
  /** 仅在 IO 中的片数合计 */
  onlyInIoTotalQty: number;
  /** 仅在 MOC 中的 identity 行数 */
  onlyInMocCount: number;
  /** 仅在 MOC 中的片数合计 */
  onlyInMocTotalQty: number;
  /** 数量不一致的 identity 行数 */
  qtyMismatchCount: number;
  /** 数量不一致行中 IO 侧片数合计 */
  qtyMismatchIoTotalQty: number;
  /** 数量不一致行中 MOC 侧片数合计 */
  qtyMismatchMocTotalQty: number;
  onlyInIo: PartsSheetBomDiffRow[];
  onlyInMoc: PartsSheetBomDiffRow[];
  qtyMismatch: PartsSheetBomDiffRow[];
};

const MAX_SAMPLE_ROWS = 40;

type BomCompareBucket = {
  partNums: Set<string>;
  elementIds: Set<string>;
  partName: string | null;
  colorId: number;
  quantity: number;
  colorName: string | null;
};

type GobricksBomBucket = BomCompareBucket & {
  label: string;
};

function primaryPartNum(partNums: Set<string>): string {
  const sorted = [...partNums]
    .map((p) => p.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return sorted[0] ?? "";
}

function joinElementIds(ids: Set<string>): string | null {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return null;
  return sorted.join(", ");
}

function legoLineKey(partNum: string, colorId: number): string {
  return `${partNum.trim().toLowerCase()}\t${colorId}`;
}

/** 从已同步的配货表行建立「乐高 design+色 → 高砖 SKU」映射（不再请求高砖）。 */
export function buildLegoToSkuFromFulfillmentItems(
  fulfillmentItems: readonly ShortageResolveItem[]
): { legoToSku: Map<string, string>; skuLabels: Map<string, string> } {
  const legoToSku = new Map<string, string>();
  const skuLabels = new Map<string, string>();
  for (const i of fulfillmentItems) {
    const sku = gobricksBomSkuKeyFromGds({
      gdsItemId: i.gdsItemId ?? null,
      gdsColorId: i.gdsColorId ?? null,
    });
    if (!sku) continue;
    const partNum = i.partNum.trim();
    const colorId = Math.trunc(i.colorId);
    if (!partNum || !Number.isFinite(colorId) || colorId < 0) continue;
    legoToSku.set(legoLineKey(partNum, colorId), sku);
    if (!skuLabels.has(sku)) {
      skuLabels.set(
        sku,
        gobricksBomSkuDisplayLabel(
          {
            gdsItemId: i.gdsItemId ?? null,
            gdsColorId: i.gdsColorId ?? null,
            gdsCaption: i.gdsCaption ?? null,
            gdsCaptionEn: i.gdsCaptionEn ?? null,
          },
          sku
        )
      );
    }
  }
  return { legoToSku, skuLabels };
}

function aggregateByGobricksSku(
  items: readonly ShortageResolveItem[],
  legoToSku: Map<string, string>,
  skuLabels: Map<string, string>
): Map<string, GobricksBomBucket> {
  const map = new Map<string, GobricksBomBucket>();
  for (const i of items) {
    const partNum = i.partNum.trim();
    const colorId = Math.trunc(i.colorId);
    const qty = Math.trunc(i.quantity);
    if (!partNum || !Number.isFinite(colorId) || colorId < 0 || !Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const sku =
      legoToSku.get(legoLineKey(partNum, colorId)) ?? `lego-unresolved:${legoLineKey(partNum, colorId)}`;
    const label =
      skuLabels.get(sku) ??
      (sku.startsWith("lego-unresolved:")
        ? partNum
        : sku.includes("\t")
          ? `GDS-${sku.replace("\t", "-")}`
          : `GDS-${sku}`);
    const eid = i.elementId?.trim();
    const cur = map.get(sku);
    if (cur) {
      cur.quantity += qty;
      cur.partNums.add(partNum);
      if (eid) cur.elementIds.add(eid);
      if (!cur.colorName && i.colorName) cur.colorName = i.colorName;
      if (!cur.partName && i.partName) cur.partName = i.partName;
    } else {
      map.set(sku, {
        label,
        partNums: new Set([partNum]),
        elementIds: eid ? new Set([eid]) : new Set(),
        partName: i.partName,
        colorId,
        quantity: qty,
        colorName: i.colorName,
      });
    }
  }
  return map;
}

function bucketToDiffBase(bucket: BomCompareBucket): Pick<
  PartsSheetBomDiffRow,
  "elementId" | "partNum" | "partName" | "colorId" | "colorName"
> {
  const partNum = primaryPartNum(bucket.partNums);
  const partName = bucket.partName?.trim() || null;
  const gobricksLabel = (bucket as GobricksBomBucket).label;
  const displayName =
    partName ||
    (gobricksLabel && gobricksLabel !== partNum && !gobricksLabel.startsWith("GDS-")
      ? gobricksLabel
      : null);
  return {
    elementId: joinElementIds(bucket.elementIds),
    partNum,
    partName: displayName,
    colorId: bucket.colorId,
    colorName: bucket.colorName,
  };
}

function mergeIoBuckets(buckets: readonly BomCompareBucket[]): BomCompareBucket {
  const first = buckets[0]!;
  if (buckets.length === 1) return first;
  const partNums = new Set<string>();
  const elementIds = new Set<string>();
  let quantity = 0;
  let partName = first.partName;
  let colorName = first.colorName;
  for (const b of buckets) {
    quantity += b.quantity;
    for (const p of b.partNums) partNums.add(p);
    for (const e of b.elementIds) elementIds.add(e);
    if (!partName && b.partName) partName = b.partName;
    if (!colorName && b.colorName) colorName = b.colorName;
  }
  return {
    partNums,
    elementIds,
    partName,
    colorId: first.colorId,
    quantity,
    colorName,
  };
}

/** 将「仅在 IO」与「仅在 MOC」中可视为替代/同规格的行配对；数量相同则从差异表移除。 */
function pairUnmatchedOnlyInRows(
  onlyInIo: PartsSheetBomDiffRow[],
  onlyInMoc: PartsSheetBomDiffRow[],
  substituteClosure: ReadonlyMap<string, ReadonlySet<string>>
): {
  onlyInIo: PartsSheetBomDiffRow[];
  onlyInMoc: PartsSheetBomDiffRow[];
  pairedQtyMismatch: PartsSheetBomDiffRow[];
} {
  const pairedMocIdx = new Set<number>();
  const remainIo: PartsSheetBomDiffRow[] = [];
  const pairedQtyMismatch: PartsSheetBomDiffRow[] = [];

  for (const ioRow of onlyInIo) {
    let matchIdx = -1;
    for (let i = 0; i < onlyInMoc.length; i++) {
      if (pairedMocIdx.has(i)) continue;
      const mocRow = onlyInMoc[i]!;
      if (ioRow.colorId !== mocRow.colorId) continue;
      if (!partNumsCanPairViaSubstitute(ioRow.partNum, mocRow.partNum, substituteClosure)) continue;
      matchIdx = i;
      break;
    }
    if (matchIdx < 0) {
      remainIo.push(ioRow);
      continue;
    }
    pairedMocIdx.add(matchIdx);
    const mocRow = onlyInMoc[matchIdx]!;
    if (ioRow.ioQty !== mocRow.mocQty) {
      pairedQtyMismatch.push({
        elementId: [ioRow.elementId, mocRow.elementId].filter(Boolean).join(", ") || null,
        partNum: ioRow.partNum || mocRow.partNum,
        partName: ioRow.partName ?? mocRow.partName,
        colorId: ioRow.colorId,
        colorName: ioRow.colorName ?? mocRow.colorName,
        ioQty: ioRow.ioQty,
        mocQty: mocRow.mocQty,
      });
    }
  }

  const remainMoc = onlyInMoc.filter((_, i) => !pairedMocIdx.has(i));
  return { onlyInIo: remainIo, onlyInMoc: remainMoc, pairedQtyMismatch };
}

function mergeBucketDiffRow(
  ioBucket: BomCompareBucket,
  mocBucket: BomCompareBucket,
  ioQty: number,
  mocQty: number
): PartsSheetBomDiffRow {
  const mergedPartNums = new Set([...ioBucket.partNums, ...mocBucket.partNums]);
  const mergedElementIds = new Set([...ioBucket.elementIds, ...mocBucket.elementIds]);
  return {
    elementId: joinElementIds(mergedElementIds),
    partNum: primaryPartNum(mergedPartNums),
    partName: ioBucket.partName ?? mocBucket.partName,
    colorId: ioBucket.colorId,
    colorName: ioBucket.colorName ?? mocBucket.colorName,
    ioQty,
    mocQty,
  };
}

function sortDiffRows(rows: PartsSheetBomDiffRow[]): PartsSheetBomDiffRow[] {
  return [...rows].sort((a, b) => {
    const ec = (a.elementId ?? "").localeCompare(b.elementId ?? "");
    if (ec !== 0) return ec;
    const pc = a.partNum.localeCompare(b.partNum);
    if (pc !== 0) return pc;
    return a.colorId - b.colorId;
  });
}

function takeSample(rows: PartsSheetBomDiffRow[]): PartsSheetBomDiffRow[] {
  return sortDiffRows(rows).slice(0, MAX_SAMPLE_ROWS);
}

function sumDiffRowsQty(rows: readonly PartsSheetBomDiffRow[], side: "io" | "moc"): number {
  let n = 0;
  for (const r of rows) {
    n += side === "io" ? r.ioQty : r.mocQty;
  }
  return n;
}

/** 差异表全部行的 IO / MOC 列片数合计（与 onlyIn* / qtyMismatch* 字段之和一致） */
export function diffTableColumnTotals(summary: {
  onlyInIoTotalQty: number;
  onlyInMocTotalQty: number;
  qtyMismatchIoTotalQty: number;
  qtyMismatchMocTotalQty: number;
}): { io: number; moc: number } {
  return {
    io: summary.onlyInIoTotalQty + summary.qtyMismatchIoTotalQty,
    moc: summary.onlyInMocTotalQty + summary.qtyMismatchMocTotalQty,
  };
}

function assertBomCompareQtyInvariant(summary: PartsSheetBomCompareSummary): void {
  const { io: diffIo, moc: diffMoc } = diffTableColumnTotals(summary);
  const modelDelta = summary.ioTotalQty - summary.mocTotalQty;
  const diffDelta = diffIo - diffMoc;
  if (modelDelta !== diffDelta) {
    console.error("[comparePartsSheetBom] qty invariant violated", {
      modelDelta,
      diffDelta,
      ioTotalQty: summary.ioTotalQty,
      mocTotalQty: summary.mocTotalQty,
      diffIo,
      diffMoc,
    });
  }
}

function compareBomBucketMaps(
  ioMap: Map<string, BomCompareBucket>,
  mocMap: Map<string, BomCompareBucket>
): PartsSheetBomCompareSummary {
  const onlyInIoAll: PartsSheetBomDiffRow[] = [];
  const onlyInMocAll: PartsSheetBomDiffRow[] = [];
  const qtyMismatchAll: PartsSheetBomDiffRow[] = [];

  for (const [sku, ioBucket] of ioMap) {
    const mocBucket = mocMap.get(sku);
    if (!mocBucket) {
      onlyInIoAll.push({
        ...bucketToDiffBase(ioBucket),
        ioQty: ioBucket.quantity,
        mocQty: 0,
      });
      continue;
    }
    if (ioBucket.quantity !== mocBucket.quantity) {
      qtyMismatchAll.push(
        mergeBucketDiffRow(ioBucket, mocBucket, ioBucket.quantity, mocBucket.quantity)
      );
    }
  }

  for (const [sku, mocBucket] of mocMap) {
    if (!ioMap.has(sku)) {
      onlyInMocAll.push({
        ...bucketToDiffBase(mocBucket),
        ioQty: 0,
        mocQty: mocBucket.quantity,
      });
    }
  }

  let ioTotalQty = 0;
  for (const v of ioMap.values()) ioTotalQty += v.quantity;
  let mocTotalQty = 0;
  for (const v of mocMap.values()) mocTotalQty += v.quantity;

  const match =
    onlyInIoAll.length === 0 && onlyInMocAll.length === 0 && qtyMismatchAll.length === 0;

  const summary: PartsSheetBomCompareSummary = {
    match,
    ioLineCount: ioMap.size,
    mocLineCount: mocMap.size,
    ioTotalQty,
    mocTotalQty,
    onlyInIoCount: onlyInIoAll.length,
    onlyInIoTotalQty: sumDiffRowsQty(onlyInIoAll, "io"),
    onlyInMocCount: onlyInMocAll.length,
    onlyInMocTotalQty: sumDiffRowsQty(onlyInMocAll, "moc"),
    qtyMismatchCount: qtyMismatchAll.length,
    qtyMismatchIoTotalQty: sumDiffRowsQty(qtyMismatchAll, "io"),
    qtyMismatchMocTotalQty: sumDiffRowsQty(qtyMismatchAll, "moc"),
    onlyInIo: takeSample(onlyInIoAll),
    onlyInMoc: takeSample(onlyInMocAll),
    qtyMismatch: takeSample(qtyMismatchAll),
  };
  assertBomCompareQtyInvariant(summary);
  return summary;
}

/**
 * IO 侧提交高砖 `lego2ItemList` 解析 SKU；MOC 侧用已存配货表的 `gds_*`（上传完整表时同步得到），按高砖 SKU 聚合数量后对照。
 */
export async function comparePartsSheetBomsViaGobricks(
  ioItems: readonly ShortageResolveItem[],
  mocFullItems: readonly ShortageResolveItem[],
  mocFulfillmentItems: readonly ShortageResolveItem[],
  init?: { signal?: AbortSignal }
): Promise<PartsSheetBomCompareSummary> {
  const ioBom = aggregateBomForGobricks(ioItems);
  const ioPayload = await fetchGobricksLego2MergedPayload(bomToGobricksTestList(ioBom), {
    signal: init?.signal,
  });

  const ioMaps = buildLegoDesignColorToGobricksSkuMap(ioPayload);
  const mocMaps = buildLegoToSkuFromFulfillmentItems(mocFulfillmentItems);
  const skuLabels = new Map<string, string>([...ioMaps.skuLabels, ...mocMaps.skuLabels]);

  const ioMap = aggregateByGobricksSku(ioItems, ioMaps.legoToSku, skuLabels);
  const mocMap = aggregateByGobricksSku(mocFullItems, mocMaps.legoToSku, skuLabels);

  return compareBomBucketMaps(ioMap, mocMap);
}

function partColorKey(partNum: string, colorId: number): string {
  return `${partNum.trim().toLowerCase()}\t${Math.trunc(colorId)}`;
}

function mechColorKey(partNum: string, colorId: number): string {
  return `${legoMechanicalPartKey(partNum)}\t${Math.trunc(colorId)}`;
}

/** 聚合主键：优先 element_id，否则 part_num + Rebrickable color_id */
function canonicalLegoBomKey(item: ShortageResolveItem): string {
  const eid = item.elementId?.trim();
  if (eid) return `e:${eid}`;
  const partNum = item.partNum.trim();
  const colorId = Math.trunc(item.colorId);
  if (!partNum || !Number.isFinite(colorId) || colorId < 0) return "";
  return `p:${partColorKey(partNum, colorId)}`;
}

function mergeIntoBomBucket(map: Map<string, BomCompareBucket>, key: string, item: ShortageResolveItem): void {
  const partNum = item.partNum.trim();
  const colorId = Math.trunc(item.colorId);
  const qty = Math.trunc(item.quantity);
  if (!key || !partNum || !Number.isFinite(colorId) || colorId < 0 || !Number.isFinite(qty) || qty <= 0) {
    return;
  }

  const eid = item.elementId?.trim();
  const cur = map.get(key);
  if (cur) {
    cur.quantity += qty;
    cur.partNums.add(partNum);
    if (eid) cur.elementIds.add(eid);
    if (!cur.colorName && item.colorName) cur.colorName = item.colorName;
    if (!cur.partName && item.partName) cur.partName = item.partName;
  } else {
    map.set(key, {
      partNums: new Set([partNum]),
      elementIds: eid ? new Set([eid]) : new Set(),
      partName: item.partName,
      colorId,
      quantity: qty,
      colorName: item.colorName,
    });
  }
}

function aggregateByCanonicalLegoKey(items: readonly ShortageResolveItem[]): Map<string, BomCompareBucket> {
  const map = new Map<string, BomCompareBucket>();
  for (const item of items) {
    mergeIntoBomBucket(map, canonicalLegoBomKey(item), item);
  }
  return map;
}

function buildMocLegoKeyAlias(
  items: readonly ShortageResolveItem[],
  substituteClosure: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, string> {
  const alias = new Map<string, string>();
  for (const item of items) {
    const canon = canonicalLegoBomKey(item);
    if (!canon) continue;
    const subs = substitutePartNumsForItem(item.partNum, substituteClosure);
    for (const k of legoBomAliasKeys(item, { substitutePartNums: subs })) {
      alias.set(k, canon);
    }
  }
  return alias;
}

function resolveMocBucketKey(
  ioKey: string,
  ioItem: ShortageResolveItem,
  mocMap: Map<string, BomCompareBucket>,
  mocAlias: Map<string, string>,
  substituteClosure: ReadonlyMap<string, ReadonlySet<string>>
): string | null {
  if (mocMap.has(ioKey)) return ioKey;
  const subs = substitutePartNumsForItem(ioItem.partNum, substituteClosure);
  for (const k of legoBomAliasKeys(ioItem, { substitutePartNums: subs })) {
    const canon = mocAlias.get(k);
    if (canon && mocMap.has(canon)) return canon;
  }
  return null;
}

/**
 * IO 解析 BOM 与 Studio 完整零件表对照：按 element_id（优先）与 part_num+color_id 对齐，不经高砖 SKU。
 */
export function comparePartsSheetBomsByLegoIdentity(
  ioItems: readonly ShortageResolveItem[],
  mocFullItems: readonly ShortageResolveItem[]
): PartsSheetBomCompareSummary {
  const substituteClosure = buildPartSubstituteClosure([
    ...ioItems.map((i) => i.partNum),
    ...mocFullItems.map((i) => i.partNum),
  ]);
  const mocMap = aggregateByCanonicalLegoKey(mocFullItems);
  const mocAlias = buildMocLegoKeyAlias(mocFullItems, substituteClosure);
  const ioMap = aggregateByCanonicalLegoKey(ioItems);

  const matchedMocKeys = new Set<string>();
  const ioOnlyBuckets: BomCompareBucket[] = [];
  const ioBucketsByMocKey = new Map<string, BomCompareBucket[]>();
  const qtyMismatchAll: PartsSheetBomDiffRow[] = [];

  for (const [ioKey, ioBucket] of ioMap) {
    const ioRep: ShortageResolveItem = {
      lineNumber: 0,
      partNum: primaryPartNum(ioBucket.partNums),
      colorId: ioBucket.colorId,
      elementId: joinElementIds(ioBucket.elementIds),
      quantity: ioBucket.quantity,
      partName: ioBucket.partName,
      partCatName: null,
      isPrinted: false,
      sheetTags: [],
      colorName: ioBucket.colorName,
      elementKnown: Boolean(joinElementIds(ioBucket.elementIds)),
      rest: "",
      partFound: true,
      imgUrl: null,
      imgSource: null,
    };

    const mocKey = resolveMocBucketKey(ioKey, ioRep, mocMap, mocAlias, substituteClosure);
    if (!mocKey) {
      ioOnlyBuckets.push(ioBucket);
      continue;
    }

    const group = ioBucketsByMocKey.get(mocKey) ?? [];
    group.push(ioBucket);
    ioBucketsByMocKey.set(mocKey, group);
  }

  let onlyInIoAll: PartsSheetBomDiffRow[] = ioOnlyBuckets.map((ioBucket) => ({
    ...bucketToDiffBase(ioBucket),
    ioQty: ioBucket.quantity,
    mocQty: 0,
  }));

  for (const [mocKey, ioBuckets] of ioBucketsByMocKey) {
    matchedMocKeys.add(mocKey);
    const mergedIo = mergeIoBuckets(ioBuckets);
    const mocBucket = mocMap.get(mocKey)!;
    if (mergedIo.quantity !== mocBucket.quantity) {
      qtyMismatchAll.push(
        mergeBucketDiffRow(mergedIo, mocBucket, mergedIo.quantity, mocBucket.quantity)
      );
    }
  }

  let onlyInMocAll: PartsSheetBomDiffRow[] = [];
  for (const [mocKey, mocBucket] of mocMap) {
    if (matchedMocKeys.has(mocKey)) continue;
    onlyInMocAll.push({
      ...bucketToDiffBase(mocBucket),
      ioQty: 0,
      mocQty: mocBucket.quantity,
    });
  }

  const paired = pairUnmatchedOnlyInRows(onlyInIoAll, onlyInMocAll, substituteClosure);
  onlyInIoAll = paired.onlyInIo;
  onlyInMocAll = paired.onlyInMoc;
  qtyMismatchAll.push(...paired.pairedQtyMismatch);

  let ioTotalQty = 0;
  for (const v of ioMap.values()) ioTotalQty += v.quantity;
  let mocTotalQty = 0;
  for (const v of mocMap.values()) mocTotalQty += v.quantity;

  const match =
    onlyInIoAll.length === 0 && onlyInMocAll.length === 0 && qtyMismatchAll.length === 0;

  const summary: PartsSheetBomCompareSummary = {
    match,
    ioLineCount: ioMap.size,
    mocLineCount: mocMap.size,
    ioTotalQty,
    mocTotalQty,
    onlyInIoCount: onlyInIoAll.length,
    onlyInIoTotalQty: sumDiffRowsQty(onlyInIoAll, "io"),
    onlyInMocCount: onlyInMocAll.length,
    onlyInMocTotalQty: sumDiffRowsQty(onlyInMocAll, "moc"),
    qtyMismatchCount: qtyMismatchAll.length,
    qtyMismatchIoTotalQty: sumDiffRowsQty(qtyMismatchAll, "io"),
    qtyMismatchMocTotalQty: sumDiffRowsQty(qtyMismatchAll, "moc"),
    onlyInIo: takeSample(onlyInIoAll),
    onlyInMoc: takeSample(onlyInMocAll),
    qtyMismatch: takeSample(qtyMismatchAll),
  };
  assertBomCompareQtyInvariant(summary);
  return summary;
}

export function formatPartsSheetBomLineLabel(row: {
  partNum: string;
  partName?: string | null;
  colorId: number;
  colorName: string | null;
}): string {
  const name = row.partName?.trim() || row.partNum;
  return row.colorName
    ? `${name} · ${row.colorName}（${row.colorId}）`
    : `${name} · 色 ${row.colorId}`;
}
