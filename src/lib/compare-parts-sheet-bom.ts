import {
  aggregateBomForGobricks,
  bomToGobricksTestList,
  buildLegoDesignColorToGobricksSkuMap,
  fetchGobricksLego2MergedPayload,
  gobricksBomSkuDisplayLabel,
  gobricksBomSkuKeyFromGds,
} from "@/lib/gobricks-lego2-item-list";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type PartsSheetBomLine = {
  partNum: string;
  colorId: number;
  quantity: number;
  colorName: string | null;
  elementId: string | null;
};

export type PartsSheetBomDiffRow = {
  partNum: string;
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
  onlyInIoCount: number;
  onlyInMocCount: number;
  qtyMismatchCount: number;
  onlyInIo: PartsSheetBomDiffRow[];
  onlyInMoc: PartsSheetBomDiffRow[];
  qtyMismatch: PartsSheetBomDiffRow[];
};

const MAX_SAMPLE_ROWS = 40;

type GobricksBomBucket = {
  label: string;
  partNums: Set<string>;
  colorId: number;
  quantity: number;
  colorName: string | null;
};

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

function formatPartVariantSuffix(partNums: Set<string>, primaryLabel: string): string {
  const sorted = [...partNums]
    .map((p) => p.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (sorted.length <= 1) return primaryLabel;
  const variants = sorted.filter((p) => !primaryLabel.includes(p));
  if (variants.length === 0) return primaryLabel;
  return `${primaryLabel}（${variants.join(", ")}）`;
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
    const cur = map.get(sku);
    if (cur) {
      cur.quantity += qty;
      cur.partNums.add(partNum);
      if (!cur.colorName && i.colorName) cur.colorName = i.colorName;
    } else {
      map.set(sku, {
        label,
        partNums: new Set([partNum]),
        colorId,
        quantity: qty,
        colorName: i.colorName,
      });
    }
  }
  return map;
}

function bucketToDiffFields(bucket: GobricksBomBucket): {
  partNum: string;
  colorId: number;
  colorName: string | null;
  quantity: number;
} {
  return {
    partNum: formatPartVariantSuffix(bucket.partNums, bucket.label),
    colorId: bucket.colorId,
    colorName: bucket.colorName,
    quantity: bucket.quantity,
  };
}

function sortDiffRows(rows: PartsSheetBomDiffRow[]): PartsSheetBomDiffRow[] {
  return [...rows].sort((a, b) => {
    const pc = a.partNum.localeCompare(b.partNum);
    if (pc !== 0) return pc;
    return a.colorId - b.colorId;
  });
}

function takeSample(rows: PartsSheetBomDiffRow[]): PartsSheetBomDiffRow[] {
  return sortDiffRows(rows).slice(0, MAX_SAMPLE_ROWS);
}

function compareGobricksSkuMaps(
  ioMap: Map<string, GobricksBomBucket>,
  mocMap: Map<string, GobricksBomBucket>
): PartsSheetBomCompareSummary {
  const onlyInIoAll: PartsSheetBomDiffRow[] = [];
  const onlyInMocAll: PartsSheetBomDiffRow[] = [];
  const qtyMismatchAll: PartsSheetBomDiffRow[] = [];

  for (const [sku, ioBucket] of ioMap) {
    const mocBucket = mocMap.get(sku);
    const io = bucketToDiffFields(ioBucket);
    if (!mocBucket) {
      onlyInIoAll.push({
        partNum: io.partNum,
        colorId: io.colorId,
        colorName: io.colorName,
        ioQty: io.quantity,
        mocQty: 0,
      });
      continue;
    }
    const moc = bucketToDiffFields(mocBucket);
    if (io.quantity !== moc.quantity) {
      qtyMismatchAll.push({
        partNum: io.partNum,
        colorId: io.colorId,
        colorName: io.colorName ?? moc.colorName,
        ioQty: io.quantity,
        mocQty: moc.quantity,
      });
    }
  }

  for (const [sku, mocBucket] of mocMap) {
    if (!ioMap.has(sku)) {
      const moc = bucketToDiffFields(mocBucket);
      onlyInMocAll.push({
        partNum: moc.partNum,
        colorId: moc.colorId,
        colorName: moc.colorName,
        ioQty: 0,
        mocQty: moc.quantity,
      });
    }
  }

  let ioTotalQty = 0;
  for (const v of ioMap.values()) ioTotalQty += v.quantity;
  let mocTotalQty = 0;
  for (const v of mocMap.values()) mocTotalQty += v.quantity;

  const match =
    onlyInIoAll.length === 0 && onlyInMocAll.length === 0 && qtyMismatchAll.length === 0;

  return {
    match,
    ioLineCount: ioMap.size,
    mocLineCount: mocMap.size,
    ioTotalQty,
    mocTotalQty,
    onlyInIoCount: onlyInIoAll.length,
    onlyInMocCount: onlyInMocAll.length,
    qtyMismatchCount: qtyMismatchAll.length,
    onlyInIo: takeSample(onlyInIoAll),
    onlyInMoc: takeSample(onlyInMocAll),
    qtyMismatch: takeSample(qtyMismatchAll),
  };
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

  return compareGobricksSkuMaps(ioMap, mocMap);
}

export function formatPartsSheetBomLineLabel(row: {
  partNum: string;
  colorId: number;
  colorName: string | null;
}): string {
  return row.colorName
    ? `${row.partNum} · ${row.colorName}（${row.colorId}）`
    : `${row.partNum} · 色 ${row.colorId}`;
}
