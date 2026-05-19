import { bomPartColorKey } from "@/lib/lego-bom-compare-keys";
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
  /** Rebrickable inventory 缩略图（零件+色） */
  imgUrl: string | null;
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
  imgUrl: string | null;
};

function pickBucketImgUrl(
  current: string | null | undefined,
  next: string | null | undefined
): string | null {
  if (current?.trim()) return current.trim();
  return next?.trim() || null;
}

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

function bucketToDiffBase(bucket: BomCompareBucket): Pick<
  PartsSheetBomDiffRow,
  "elementId" | "partNum" | "partName" | "colorId" | "colorName" | "imgUrl"
> {
  const partNum = primaryPartNum(bucket.partNums);
  return {
    elementId: joinElementIds(bucket.elementIds),
    partNum,
    partName: bucket.partName?.trim() || null,
    colorId: bucket.colorId,
    colorName: bucket.colorName,
    imgUrl: bucket.imgUrl,
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
  let imgUrl = first.imgUrl;
  for (const b of buckets) {
    quantity += b.quantity;
    for (const p of b.partNums) partNums.add(p);
    for (const e of b.elementIds) elementIds.add(e);
    if (!partName && b.partName) partName = b.partName;
    if (!colorName && b.colorName) colorName = b.colorName;
    imgUrl = pickBucketImgUrl(imgUrl, b.imgUrl);
  }
  return {
    partNums,
    elementIds,
    partName,
    colorId: first.colorId,
    quantity,
    colorName,
    imgUrl,
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
        imgUrl: pickBucketImgUrl(ioRow.imgUrl, mocRow.imgUrl),
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
    imgUrl: pickBucketImgUrl(ioBucket.imgUrl, mocBucket.imgUrl),
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

function assertBomCompareQtyInvariant(summary: PartsSheetBomCompareSummary): void {
  const diffIo = summary.onlyInIoTotalQty + summary.qtyMismatchIoTotalQty;
  const diffMoc = summary.onlyInMocTotalQty + summary.qtyMismatchMocTotalQty;
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

/** 聚合主键：优先 element_id，否则 part_num + Rebrickable color_id */
function canonicalLegoBomKey(item: ShortageResolveItem): string {
  const eid = item.elementId?.trim();
  if (eid) return `e:${eid}`;
  const partNum = item.partNum.trim();
  const colorId = Math.trunc(item.colorId);
  if (!partNum || !Number.isFinite(colorId) || colorId < 0) return "";
  return `p:${bomPartColorKey(partNum, colorId)}`;
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
    cur.imgUrl = pickBucketImgUrl(cur.imgUrl, item.imgUrl);
  } else {
    map.set(key, {
      partNums: new Set([partNum]),
      elementIds: eid ? new Set([eid]) : new Set(),
      partName: item.partName,
      colorId,
      quantity: qty,
      colorName: item.colorName,
      imgUrl: item.imgUrl?.trim() || null,
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
