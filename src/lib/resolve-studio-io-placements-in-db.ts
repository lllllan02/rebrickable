import { and, inArray } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { colors, elements } from "@/db/schema";
import {
  legoMechanicalPartKey,
  legoMechanicalPartKeysEquivalent,
} from "@/lib/lego-mechanical-part-key";
import type { StudioIoPlacement } from "@/lib/parse-studio-io";
import type { StudioLxfmlBrick } from "@/lib/parse-studio-lxfml";
import {
  resolvePartsSheetIdentitiesInDb,
  type ResolveShortageCsvDbResult,
} from "@/lib/parts-sheet-resolve-csv-db";
import {
  enrichStudioIoPlacementsWithItemNos,
  studioLdrawColorAliases,
} from "@/lib/studio-io-item-lookup";

type AggregatedPlacementRow = {
  partNum: string;
  ldrawColorId: number;
  legoItemNo: string | null;
  quantity: number;
  rest: string;
};

function placementsToRows(placements: StudioIoPlacement[]): AggregatedPlacementRow[] {
  const map = new Map<string, AggregatedPlacementRow>();
  for (const p of placements) {
    const partNum = p.partNum;
    const ldrawColorId = p.ldrawColorId;
    const legoItemNo = p.legoItemNo?.trim() || null;
    const key = legoItemNo
      ? `item:${legoItemNo}`
      : `${legoMechanicalPartKey(partNum)}\t${ldrawColorId}`;
    const rest = p.isSubmodelRef
      ? `Studio 子组件（未展开）: ${p.submodelName ?? p.partNum}`
      : "Studio .io 导入";
    const cur = map.get(key);
    if (cur) {
      cur.quantity += 1;
    } else {
      map.set(key, { partNum, ldrawColorId, legoItemNo, quantity: 1, rest });
    }
  }
  return [...map.values()];
}

/** 批量用 itemNos（elements.element_id）得到 Rebrickable part_num / color_id */
async function rebrickableIdentityByLegoItemNos(
  itemNos: readonly string[]
): Promise<Map<string, { partNum: string; colorId: number }>> {
  const ids = [...new Set(itemNos.map((s) => s.trim()).filter(Boolean))];
  const out = new Map<string, { partNum: string; colorId: number }>();
  if (ids.length === 0) return out;

  const db = getCatalogDb();
  const hits = await db
    .select({
      elementId: elements.elementId,
      partNum: elements.partNum,
      colorId: elements.colorId,
    })
    .from(elements)
    .where(inArray(elements.elementId, ids));

  for (const h of hits) {
    out.set(h.elementId, { partNum: h.partNum, colorId: h.colorId });
  }
  return out;
}

async function elementColorByItemNos(
  itemNos: readonly string[]
): Promise<Map<string, { colorId: number }>> {
  const ids = [...new Set(itemNos.map((s) => s.trim()).filter(Boolean))];
  const out = new Map<string, { colorId: number }>();
  if (ids.length === 0) return out;

  const db = getCatalogDb();
  const hits = await db
    .select({ elementId: elements.elementId, colorId: elements.colorId })
    .from(elements)
    .where(inArray(elements.elementId, ids));

  for (const h of hits) {
    out.set(h.elementId, { colorId: h.colorId });
  }
  return out;
}

function allCatalogItemNos(catalog: ReadonlyMap<number, StudioLxfmlBrick>): string[] {
  return [...new Set([...catalog.values()].map((b) => b.legoItemNo.trim()).filter(Boolean))];
}

function partNumCandidates(partNum: string): string[] {
  const t = partNum.trim();
  const mech = legoMechanicalPartKey(t);
  const out = new Set<string>([t, mech, `${mech}a`, `${mech}b`]);
  return [...out];
}

/** lxfml 未收录的零件：用 part + LDraw 色在 elements 表推断 element_id */
async function inferElementIdByPartAndLdrawColor(
  partNum: string,
  ldrawColorId: number,
  catalogItemNos: ReadonlySet<string>,
  catalog: ReadonlyMap<number, StudioLxfmlBrick>
): Promise<string | null> {
  const partCandidates = partNumCandidates(partNum);
  const colorCandidates = studioLdrawColorAliases(ldrawColorId);
  if (partCandidates.length === 0 || colorCandidates.length === 0) return null;

  const db = getCatalogDb();
  const hits = await db
    .select({ elementId: elements.elementId })
    .from(elements)
    .where(
      and(inArray(elements.partNum, partCandidates), inArray(elements.colorId, colorCandidates))
    )
    .orderBy(elements.elementId);

  if (hits.length === 0) return null;

  const preferred = hits.filter((h) => catalogItemNos.has(h.elementId));
  if (preferred.length === 1) return preferred[0]!.elementId;
  if (preferred.length > 1) return preferred[0]!.elementId;

  const designInLxfml = [...catalog.values()].some((b) =>
    legoMechanicalPartKeysEquivalent(b.designId, partNum)
  );
  if (hits.length === 1 && designInLxfml) return hits[0]!.elementId;
  return null;
}

async function inferMissingItemNos(
  placements: StudioIoPlacement[],
  catalog: ReadonlyMap<number, StudioLxfmlBrick>,
  catalogItemNos: ReadonlySet<string>
): Promise<StudioIoPlacement[]> {
  const out: StudioIoPlacement[] = [];
  for (const p of placements) {
    if (p.isSubmodelRef || p.legoItemNo?.trim()) {
      out.push(p);
      continue;
    }
    const inferred = await inferElementIdByPartAndLdrawColor(
      p.partNum,
      p.ldrawColorId,
      catalogItemNos,
      catalog
    );
    out.push(inferred ? { ...p, legoItemNo: inferred } : p);
  }
  return out;
}

/** 哪些 ID 在 Rebrickable colors 表中存在（LDraw 色码与 RB id 多数一致，但新色会不同） */
async function rebrickableColorIdSet(ids: readonly number[]): Promise<Set<number>> {
  const uniq = [...new Set(ids.filter((n) => Number.isFinite(n) && n >= 0))];
  if (uniq.length === 0) return new Set();

  const db = getCatalogDb();
  const rows = await db
    .select({ id: colors.id })
    .from(colors)
    .where(inArray(colors.id, uniq));
  return new Set(rows.map((r) => r.id));
}

function placementRowsToResolveInput(
  rows: AggregatedPlacementRow[],
  byItemNo: Map<string, { partNum: string; colorId: number }>,
  validRbColorIds: Set<number>
): {
  partNum: string;
  colorId: number;
  elementId: string | null;
  quantity: number;
  rest: string;
}[] {
  return rows.map((r) => {
    const itemHit = r.legoItemNo ? byItemNo.get(r.legoItemNo) : undefined;
    if (itemHit) {
      return {
        partNum: itemHit.partNum,
        colorId: itemHit.colorId,
        elementId: r.legoItemNo,
        quantity: r.quantity,
        rest: r.rest,
      };
    }

    let rest = r.rest;
    if (!validRbColorIds.has(r.ldrawColorId) && !r.legoItemNo) {
      rest = [rest, `Studio LDraw 色 ${r.ldrawColorId} 无对应 Rebrickable 色，且缺少 itemNos`]
        .filter(Boolean)
        .join("；");
    } else if (!validRbColorIds.has(r.ldrawColorId) && r.legoItemNo && !itemHit) {
      rest = [rest, `itemNos ${r.legoItemNo} 未在目录 elements 表中找到`].filter(Boolean).join("；");
    }

    return {
      partNum: r.partNum,
      colorId: r.ldrawColorId,
      elementId: r.legoItemNo,
      quantity: r.quantity,
      rest,
    };
  });
}

export type ResolveStudioIoPlacementsOptions = {
  brickCatalog?: ReadonlyMap<number, StudioLxfmlBrick>;
};

export async function resolveStudioIoPlacementsInDb(
  placements: StudioIoPlacement[],
  options?: ResolveStudioIoPlacementsOptions
): Promise<ResolveShortageCsvDbResult> {
  if (placements.length === 0) {
    return { ok: true, skippedHeader: true, items: [] };
  }

  let enriched = placements;
  const catalog = options?.brickCatalog;
  if (catalog?.size) {
    const elementColors = await elementColorByItemNos(allCatalogItemNos(catalog));
    const catalogItemNos = new Set(allCatalogItemNos(catalog));
    enriched = enrichStudioIoPlacementsWithItemNos(placements, catalog, elementColors);
    enriched = await inferMissingItemNos(enriched, catalog, catalogItemNos);
  }

  const aggregated = placementsToRows(enriched);
  const byItemNo = await rebrickableIdentityByLegoItemNos(
    aggregated.map((r) => r.legoItemNo).filter((id): id is string => id != null)
  );
  const validRbColorIds = await rebrickableColorIdSet(aggregated.map((r) => r.ldrawColorId));

  const resolveRows = placementRowsToResolveInput(aggregated, byItemNo, validRbColorIds);
  return resolvePartsSheetIdentitiesInDb(resolveRows);
}
