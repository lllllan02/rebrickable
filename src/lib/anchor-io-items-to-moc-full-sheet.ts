import {
  legoMechanicalPartKey,
  legoMechanicalPartKeysEquivalent,
} from "@/lib/lego-mechanical-part-key";
import { studioLdrawColorAliases } from "@/lib/studio-io-item-lookup";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

const ANCHOR_NOTE = "已对齐 MOC 完整表";

export type MocFullSheetAnchorStats = {
  totalLines: number;
  /** 身份已与完整表一致，未改写 */
  alreadyMatched: number;
  byElementId: number;
  byLdrawColor: number;
  byPartColor: number;
  byMechPartColor: number;
  byUniqueMech: number;
  /** 无法在完整表中找到对应行 */
  unmatched: number;
};

/** Studio LdrawId / .io 中 .dat 文件名（无后缀、小写） */
export function normalizeLdrawPartToken(
  partNum: string,
  ldrawPartNum?: string | null
): string {
  return (ldrawPartNum ?? partNum).trim().toLowerCase().replace(/\.dat$/i, "");
}

function ldrawColorKey(ldrawPart: string, colorId: number): string {
  return `${ldrawPart}\t${colorId}`;
}

export type AnchorIoItemsToMocFullSheetResult = {
  items: ShortageResolveItem[];
  stats: MocFullSheetAnchorStats;
};

function partColorKey(partNum: string, colorId: number): string {
  return `${partNum.trim().toLowerCase()}\t${colorId}`;
}

function mechColorKey(partNum: string, colorId: number): string {
  return `${legoMechanicalPartKey(partNum)}\t${colorId}`;
}

function identityKey(item: Pick<ShortageResolveItem, "partNum" | "colorId" | "elementId">): string {
  const eid = item.elementId?.trim();
  if (eid) return `e:${eid}`;
  return `p:${partColorKey(item.partNum, item.colorId)}`;
}

function sameIdentity(
  a: Pick<ShortageResolveItem, "partNum" | "colorId" | "elementId">,
  b: Pick<ShortageResolveItem, "partNum" | "colorId" | "elementId">
): boolean {
  return identityKey(a) === identityKey(b);
}

function appendAnchorNote(rest: string): string {
  if (rest.includes(ANCHOR_NOTE)) return rest;
  return [rest, ANCHOR_NOTE].filter(Boolean).join("；");
}

type MocFullSheetIndexes = {
  byElement: Map<string, ShortageResolveItem>;
  byLdrawColor: Map<string, ShortageResolveItem>;
  byPartColor: Map<string, ShortageResolveItem>;
  byMechColor: Map<string, ShortageResolveItem[]>;
  byMech: Map<string, ShortageResolveItem[]>;
};

function buildMocFullSheetIndexes(items: readonly ShortageResolveItem[]): MocFullSheetIndexes {
  const byElement = new Map<string, ShortageResolveItem>();
  const byLdrawColor = new Map<string, ShortageResolveItem>();
  const byPartColor = new Map<string, ShortageResolveItem>();
  const byMechColor = new Map<string, ShortageResolveItem[]>();
  const byMech = new Map<string, ShortageResolveItem[]>();

  for (const item of items) {
    const eid = item.elementId?.trim();
    if (eid && !byElement.has(eid)) byElement.set(eid, item);

    const ldraw = normalizeLdrawPartToken(item.partNum, item.ldrawPartNum);
    const lc = ldrawColorKey(ldraw, item.colorId);
    if (!byLdrawColor.has(lc)) byLdrawColor.set(lc, item);

    const pc = partColorKey(item.partNum, item.colorId);
    if (!byPartColor.has(pc)) byPartColor.set(pc, item);

    const mc = mechColorKey(item.partNum, item.colorId);
    const mcList = byMechColor.get(mc) ?? [];
    mcList.push(item);
    byMechColor.set(mc, mcList);

    const mk = legoMechanicalPartKey(item.partNum);
    const mList = byMech.get(mk) ?? [];
    mList.push(item);
    byMech.set(mk, mList);
  }

  return { byElement, byLdrawColor, byPartColor, byMechColor, byMech };
}

function uniqueIdentityRepresentative(rows: readonly ShortageResolveItem[]): ShortageResolveItem | null {
  const keys = new Set(rows.map((r) => identityKey(r)));
  if (keys.size !== 1) return null;
  return rows[0] ?? null;
}

type AnchorMethod =
  | "byElementId"
  | "byLdrawColor"
  | "byPartColor"
  | "byMechPartColor"
  | "byUniqueMech";

function findMocAnchor(
  io: ShortageResolveItem,
  indexes: MocFullSheetIndexes
): { moc: ShortageResolveItem; method: AnchorMethod } | null {
  const eid = io.elementId?.trim();
  if (eid) {
    const hit = indexes.byElement.get(eid);
    if (hit) return { moc: hit, method: "byElementId" };
    // element 推断与完整表不一致时，继续尝试 LDraw 零件名 + 色（如 61678.dat → 11153/6042951）
  }

  const ioLdraw = normalizeLdrawPartToken(io.partNum, io.ldrawPartNum);
  for (const colorId of studioLdrawColorAliases(io.colorId)) {
    const lcHit = indexes.byLdrawColor.get(ldrawColorKey(ioLdraw, colorId));
    if (lcHit) return { moc: lcHit, method: "byLdrawColor" };
  }

  const direct = indexes.byPartColor.get(partColorKey(io.partNum, io.colorId));
  if (direct) return { moc: direct, method: "byPartColor" };

  for (const moc of indexes.byPartColor.values()) {
    if (
      moc.colorId === io.colorId &&
      legoMechanicalPartKeysEquivalent(moc.partNum, io.partNum)
    ) {
      return { moc, method: "byMechPartColor" };
    }
  }

  for (const colorId of studioLdrawColorAliases(io.colorId)) {
    const hits = indexes.byMechColor.get(mechColorKey(io.partNum, colorId));
    const rep = hits ? uniqueIdentityRepresentative(hits) : null;
    if (rep) return { moc: rep, method: "byMechPartColor" };
  }

  const mechHits = indexes.byMech.get(legoMechanicalPartKey(io.partNum));
  const mechRep = mechHits ? uniqueIdentityRepresentative(mechHits) : null;
  if (mechRep) return { moc: mechRep, method: "byUniqueMech" };

  return null;
}

function applyMocIdentity(io: ShortageResolveItem, moc: ShortageResolveItem): ShortageResolveItem {
  if (sameIdentity(io, moc)) return io;
  return {
    ...io,
    partNum: moc.partNum,
    colorId: moc.colorId,
    elementId: moc.elementId ?? io.elementId ?? null,
    partFound: moc.partFound,
    partName: moc.partName,
    partCatName: moc.partCatName,
    colorName: moc.colorName,
    isPrinted: moc.isPrinted,
    sheetTags: moc.sheetTags,
    elementKnown: moc.elementKnown,
    imgUrl: moc.imgUrl ?? io.imgUrl,
    imgSource: moc.imgSource ?? io.imgSource,
    rest: appendAnchorNote(io.rest),
  };
}

/**
 * 以 MOC 完整零件表为真值，将 IO 解析行上的 part_num / color_id / element_id 对齐到表中已有身份。
 * 仅修正目录身份，不改变 IO 侧数量；总量差异仍会在 BOM 对照中体现。
 */
export function anchorIoItemsToMocFullSheet(
  ioItems: readonly ShortageResolveItem[],
  mocFullItems: readonly ShortageResolveItem[]
): AnchorIoItemsToMocFullSheetResult {
  if (ioItems.length === 0) {
    return {
      items: [],
      stats: {
        totalLines: 0,
        alreadyMatched: 0,
        byElementId: 0,
        byLdrawColor: 0,
        byPartColor: 0,
        byMechPartColor: 0,
        byUniqueMech: 0,
        unmatched: 0,
      },
    };
  }
  if (mocFullItems.length === 0) {
    return {
      items: [...ioItems],
      stats: {
        totalLines: ioItems.length,
        alreadyMatched: 0,
        byElementId: 0,
        byLdrawColor: 0,
        byPartColor: 0,
        byMechPartColor: 0,
        byUniqueMech: 0,
        unmatched: ioItems.length,
      },
    };
  }

  const indexes = buildMocFullSheetIndexes(mocFullItems);
  const stats: MocFullSheetAnchorStats = {
    totalLines: ioItems.length,
    alreadyMatched: 0,
    byElementId: 0,
    byLdrawColor: 0,
    byPartColor: 0,
    byMechPartColor: 0,
    byUniqueMech: 0,
    unmatched: 0,
  };

  const items = ioItems.map((io) => {
    const anchor = findMocAnchor(io, indexes);
    if (!anchor) {
      stats.unmatched++;
      return io;
    }
    if (sameIdentity(io, anchor.moc)) {
      stats.alreadyMatched++;
      return io;
    }
    if (anchor.method === "byElementId") stats.byElementId++;
    else if (anchor.method === "byLdrawColor") stats.byLdrawColor++;
    else if (anchor.method === "byPartColor") stats.byPartColor++;
    else if (anchor.method === "byMechPartColor") stats.byMechPartColor++;
    else stats.byUniqueMech++;
    return applyMocIdentity(io, anchor.moc);
  });

  return { items, stats };
}
