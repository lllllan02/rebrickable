import { bomPartColorKey } from "@/lib/lego-bom-compare-keys";
import { ioSplitPackageLabel } from "@/lib/io-split-labels";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type ManualSplitSourceKind = "full" | "official";

export type ManualSplitSourcePayload = {
  skippedHeader: boolean;
  items: ShortageResolveItem[];
};

export type ManualSplitSourceResolved = ManualSplitSourcePayload & {
  kind: ManualSplitSourceKind;
};

/** 工作页 / 持久化用的包（client clientKey；已保存后有 dbId） */
export type ManualSplitBagState = {
  clientKey: string;
  dbId?: number;
  label: string;
  isRemainder: boolean;
  items: ShortageResolveItem[];
};

/** 行身份：优先 element_id，否则 part_num + color_id（与 BOM 对照一致） */
export function manualSplitLineKey(item: Pick<ShortageResolveItem, "partNum" | "colorId" | "elementId">): string {
  const eid = item.elementId?.trim();
  if (eid) return `e:${eid}`;
  const partNum = item.partNum.trim();
  const colorId = Math.trunc(item.colorId);
  if (!partNum || !Number.isFinite(colorId) || colorId < 0) return "";
  return `p:${bomPartColorKey(partNum, colorId)}`;
}

export function totalPartQty(items: ShortageResolveItem[]): number {
  return items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? Math.trunc(i.quantity) : 0), 0);
}

export function renumberLineNumbers(items: ShortageResolveItem[]): ShortageResolveItem[] {
  return items.map((it, i) => ({ ...it, lineNumber: i + 1 }));
}

function cloneItem(item: ShortageResolveItem, quantity: number): ShortageResolveItem {
  return { ...item, quantity: Math.trunc(quantity) };
}

/** 按 lineKey 聚合数量；模板行取首次出现 */
export function aggregateByLineKey(items: ShortageResolveItem[]): Map<string, ShortageResolveItem> {
  const map = new Map<string, ShortageResolveItem>();
  for (const raw of items) {
    const key = manualSplitLineKey(raw);
    if (!key) continue;
    const qty = Math.trunc(raw.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const cur = map.get(key);
    if (cur) {
      map.set(key, cloneItem(cur, Math.trunc(cur.quantity) + qty));
    } else {
      map.set(key, cloneItem(raw, qty));
    }
  }
  return map;
}

export function itemsFromAggMap(map: Map<string, ShortageResolveItem>): ShortageResolveItem[] {
  return renumberLineNumbers([...map.values()].filter((i) => Math.trunc(i.quantity) > 0));
}

/**
 * 套装：上传完整表优先，否则官方清单。
 * MOC：仅完整表。
 */
export function resolveManualSplitSource(input: {
  subjectKind: BuildSubjectKind;
  full: ManualSplitSourcePayload | null;
  official: ManualSplitSourcePayload | null;
}): ManualSplitSourceResolved | null {
  const fullOk = Boolean(input.full && input.full.items.length > 0);
  const officialOk = Boolean(input.official && input.official.items.length > 0);

  if (input.subjectKind === BUILD_SUBJECT_SET) {
    if (fullOk && input.full) {
      return { kind: "full", skippedHeader: input.full.skippedHeader, items: input.full.items };
    }
    if (officialOk && input.official) {
      return {
        kind: "official",
        skippedHeader: input.official.skippedHeader,
        items: input.official.items,
      };
    }
    return null;
  }

  if (input.subjectKind === BUILD_SUBJECT_MOC && fullOk && input.full) {
    return { kind: "full", skippedHeader: input.full.skippedHeader, items: input.full.items };
  }
  return null;
}

export function canResolveManualSplitSource(input: {
  subjectKind: BuildSubjectKind;
  hasFull: boolean;
  hasOfficial: boolean;
}): boolean {
  if (input.subjectKind === BUILD_SUBJECT_SET) return input.hasFull || input.hasOfficial;
  return input.hasFull;
}

/** 从 from 移 1 件到 to；数量不足时原样返回 */
export function moveOneUnit(input: {
  from: ShortageResolveItem[];
  to: ShortageResolveItem[];
  lineKey: string;
}): { from: ShortageResolveItem[]; to: ShortageResolveItem[]; moved: boolean } {
  const key = input.lineKey.trim();
  if (!key) return { from: input.from, to: input.to, moved: false };

  const fromMap = aggregateByLineKey(input.from);
  const src = fromMap.get(key);
  if (!src || Math.trunc(src.quantity) < 1) {
    return { from: input.from, to: input.to, moved: false };
  }

  const nextFromQty = Math.trunc(src.quantity) - 1;
  if (nextFromQty <= 0) fromMap.delete(key);
  else fromMap.set(key, cloneItem(src, nextFromQty));

  const toMap = aggregateByLineKey(input.to);
  const dst = toMap.get(key);
  if (dst) toMap.set(key, cloneItem(dst, Math.trunc(dst.quantity) + 1));
  else toMap.set(key, cloneItem(src, 1));

  return {
    from: itemsFromAggMap(fromMap),
    to: itemsFromAggMap(toMap),
    moved: true,
  };
}

/** source − 各手动包 = 剩余 */
export function recomputeRemainder(
  sourceItems: ShortageResolveItem[],
  manualBags: { items: ShortageResolveItem[] }[]
): ShortageResolveItem[] {
  const rem = aggregateByLineKey(sourceItems);
  for (const bag of manualBags) {
    for (const [key, row] of aggregateByLineKey(bag.items)) {
      const cur = rem.get(key);
      if (!cur) continue;
      const next = Math.trunc(cur.quantity) - Math.trunc(row.quantity);
      if (next <= 0) rem.delete(key);
      else rem.set(key, cloneItem(cur, next));
    }
  }
  return itemsFromAggMap(rem);
}

export function assertPlanInvariant(
  sourceItems: ShortageResolveItem[],
  bags: { isRemainder: boolean; items: ShortageResolveItem[] }[]
): { ok: true } | { ok: false; error: string } {
  const manuals = bags.filter((b) => !b.isRemainder);
  const remainders = bags.filter((b) => b.isRemainder);
  if (remainders.length !== 1) {
    return { ok: false, error: "方案须恰好有一个剩余包。" };
  }
  const expected = recomputeRemainder(sourceItems, manuals);
  const actual = itemsFromAggMap(aggregateByLineKey(remainders[0]!.items));
  const expMap = aggregateByLineKey(expected);
  const actMap = aggregateByLineKey(actual);
  if (expMap.size !== actMap.size) {
    return { ok: false, error: "剩余包与源清单数量不一致。" };
  }
  for (const [key, row] of expMap) {
    const a = actMap.get(key);
    if (!a || Math.trunc(a.quantity) !== Math.trunc(row.quantity)) {
      return { ok: false, error: "剩余包与源清单数量不一致。" };
    }
  }
  const sourceTotal = totalPartQty(sourceItems);
  const bagsTotal = bags.reduce((s, b) => s + totalPartQty(b.items), 0);
  if (sourceTotal !== bagsTotal) {
    return { ok: false, error: "各包合计与源清单数量不一致。" };
  }
  return { ok: true };
}

export function createEmptyManualSplitState(source: ManualSplitSourcePayload): {
  manualBags: ManualSplitBagState[];
  remainder: ManualSplitBagState;
} {
  const remainderItems = renumberLineNumbers(
    source.items.map((it) => cloneItem(it, Math.trunc(it.quantity))).filter((i) => i.quantity > 0)
  );
  return {
    manualBags: [
      {
        clientKey: "bag-1",
        label: ioSplitPackageLabel(1),
        isRemainder: false,
        items: [],
      },
    ],
    remainder: {
      clientKey: "remainder",
      label: "剩余",
      isRemainder: true,
      items: remainderItems,
    },
  };
}

export function deepCloneSourcePayload(source: ManualSplitSourcePayload): ManualSplitSourcePayload {
  return {
    skippedHeader: source.skippedHeader,
    items: renumberLineNumbers(
      source.items.map((it) => cloneItem(it, Math.trunc(it.quantity))).filter((i) => i.quantity > 0)
    ),
  };
}

export function parseSourcePayloadJson(raw: string): ManualSplitSourcePayload | null {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as { skippedHeader?: unknown; items?: unknown };
    if (!Array.isArray(o.items)) return null;
    return {
      skippedHeader: Boolean(o.skippedHeader),
      items: o.items as ShortageResolveItem[],
    };
  } catch {
    return null;
  }
}

export function parseBagItemsJson(raw: string): ShortageResolveItem[] {
  try {
    const j = JSON.parse(raw) as unknown;
    if (!Array.isArray(j)) return [];
    return j as ShortageResolveItem[];
  } catch {
    return [];
  }
}

export function nextManualBagClientKey(existing: { clientKey: string }[]): string {
  let max = 0;
  for (const b of existing) {
    const m = /^bag-(\d+)$/.exec(b.clientKey);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `bag-${max + 1}`;
}

export function nextManualBagLabel(existing: { label: string; isRemainder: boolean }[]): string {
  const n = existing.filter((b) => !b.isRemainder).length + 1;
  return ioSplitPackageLabel(n);
}
