import { getReadonlyCatalogSqlite } from "@/lib/catalog-readonly-sqlite";
import { legoMechanicalPartKey } from "@/lib/lego-mechanical-part-key";
import {
  normalizeStudioLdrawColorId,
  normalizeStudioLdrawPartNum,
} from "@/lib/parse-studio-io";
import type { StudioLxfmlBrick } from "@/lib/parse-studio-lxfml";
import {
  studioLdrawColorAliases,
  type StudioIoElementLookup,
} from "@/lib/studio-io-item-lookup";

function partNumCandidates(partNum: string): string[] {
  const normalized = normalizeStudioLdrawPartNum(partNum.trim());
  const mech = legoMechanicalPartKey(normalized);
  return [...new Set([normalized, mech, `${mech}a`, `${mech}b`])];
}

function queryElementIdsForPartLdrawColor(partNum: string, ldrawColorId: number): string[] {
  const partCandidates = partNumCandidates(partNum);
  const colorCandidates = studioLdrawColorAliases(ldrawColorId);
  if (partCandidates.length === 0 || colorCandidates.length === 0) return [];

  const partPh = partCandidates.map(() => "?").join(",");
  const colorPh = colorCandidates.map(() => "?").join(",");
  const rows = getReadonlyCatalogSqlite()
    .prepare(
      `SELECT element_id AS elementId FROM elements WHERE part_num IN (${partPh}) AND color_id IN (${colorPh})`
    )
    .all(...partCandidates, ...colorCandidates) as { elementId: string }[];

  return [...new Set(rows.map((r) => r.elementId))];
}

function queryColorIdForItem(itemNo: string): number | null {
  const id = itemNo.trim();
  if (!id) return null;
  const row = getReadonlyCatalogSqlite()
    .prepare(`SELECT color_id AS colorId FROM elements WHERE element_id = ? LIMIT 1`)
    .get(id) as { colorId: number } | undefined;
  return row?.colorId ?? null;
}

function queryPartNumForItem(itemNo: string): string | null {
  const id = itemNo.trim();
  if (!id) return null;
  const row = getReadonlyCatalogSqlite()
    .prepare(`SELECT part_num AS partNum FROM elements WHERE element_id = ? LIMIT 1`)
    .get(id) as { partNum: string } | undefined;
  const part = row?.partNum?.trim();
  return part || null;
}

/**
 * 为 IO 解析补全 / 去重提供 element_id 对照（读本地 catalog SQLite，惰性按 part+色缓存）。
 */
export function buildStudioIoElementLookup(
  brickCatalog: ReadonlyMap<number, StudioLxfmlBrick>
): StudioIoElementLookup {
  const partColorCache = new Map<string, string[]>();
  const itemColorCache = new Map<string, number | null>();
  const itemPartCache = new Map<string, string | null>();
  for (const b of brickCatalog.values()) {
    const item = b.legoItemNo?.trim();
    if (item && !itemColorCache.has(item)) {
      itemColorCache.set(item, queryColorIdForItem(item));
      itemPartCache.set(item, queryPartNumForItem(item));
    }
  }

  return {
    elementIdsForPartColor(partNum: string, ldrawColorId: number): readonly string[] {
      const key = `${legoMechanicalPartKey(normalizeStudioLdrawPartNum(partNum))}\t${normalizeStudioLdrawColorId(ldrawColorId)}`;
      let hit = partColorCache.get(key);
      if (!hit) {
        hit = queryElementIdsForPartLdrawColor(partNum, ldrawColorId);
        partColorCache.set(key, hit);
      }
      return hit;
    },
    rebrickableColorIdForItem(itemNo: string): number | null {
      const id = itemNo.trim();
      if (!id) return null;
      if (itemColorCache.has(id)) return itemColorCache.get(id) ?? null;
      const colorId = queryColorIdForItem(id);
      itemColorCache.set(id, colorId);
      return colorId;
    },
    rebrickablePartNumForItem(itemNo: string): string | null {
      const id = itemNo.trim();
      if (!id) return null;
      if (itemPartCache.has(id)) return itemPartCache.get(id) ?? null;
      const partNum = queryPartNumForItem(id);
      itemPartCache.set(id, partNum);
      return partNum;
    },
  };
}
