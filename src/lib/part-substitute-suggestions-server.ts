import "server-only";

import { and, eq, inArray, isNotNull, min, ne } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { inventoryParts, partRelationships, parts } from "@/db/schema";

/** Rebrickable `part_relationships.rel_type`：替代、模具变体（与官网「可考虑替换」一致） */
const SUBSTITUTE_REL_TYPES = ["A", "M"] as const;

export type PartSubstituteSuggestion = {
  otherPartNum: string;
  partName: string | null;
  /** 任一官方库存行中的 `img_url` 聚合缩略图；无则 null */
  imgUrl: string | null;
  relTypes: ("A" | "M")[];
};

const MAX_PART_NUM_LEN = 64;
const MAX_SUGGESTIONS = 48;

function relTypeOrder(t: "A" | "M"): number {
  return t === "A" ? 0 : 1;
}

function isSubstituteRelType(t: string): t is "A" | "M" {
  return t === "A" || t === "M";
}

/**
 * 查询目录库中与 `partNum` 的替代（A）或模具变体（M）关系相连的其它零件号（双向）。
 */
export async function fetchPartSubstituteSuggestions(partNumRaw: string): Promise<PartSubstituteSuggestion[]> {
  const pn = partNumRaw.trim();
  if (!pn || pn.length > MAX_PART_NUM_LEN) return [];

  const catalogDb = getCatalogDb();
  const relList = [...SUBSTITUTE_REL_TYPES];

  const [asParent, asChild] = await Promise.all([
    catalogDb
      .select({
        relType: partRelationships.relType,
        other: partRelationships.childPartNum,
      })
      .from(partRelationships)
      .where(and(eq(partRelationships.parentPartNum, pn), inArray(partRelationships.relType, relList))),
    catalogDb
      .select({
        relType: partRelationships.relType,
        other: partRelationships.parentPartNum,
      })
      .from(partRelationships)
      .where(and(eq(partRelationships.childPartNum, pn), inArray(partRelationships.relType, relList))),
  ]);

  const byOther = new Map<string, Set<"A" | "M">>();
  for (const r of [...asParent, ...asChild]) {
    if (r.other === pn) continue;
    if (!isSubstituteRelType(r.relType)) continue;
    let s = byOther.get(r.other);
    if (!s) {
      s = new Set();
      byOther.set(r.other, s);
    }
    s.add(r.relType);
  }

  const others = [...byOther.keys()].sort((a, b) => a.localeCompare(b));
  if (others.length === 0) return [];

  const slice = others.slice(0, MAX_SUGGESTIONS);
  const [nameRows, thumbRows] = await Promise.all([
    catalogDb
      .select({ partNum: parts.partNum, name: parts.name })
      .from(parts)
      .where(inArray(parts.partNum, slice)),
    catalogDb
      .select({
        partNum: inventoryParts.partNum,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, slice),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum),
  ]);

  const nameBy = new Map(nameRows.map((row) => [row.partNum, row.name]));
  const thumbBy = new Map<string, string>();
  for (const row of thumbRows) {
    const u = row.thumb;
    if (typeof u === "string" && u.trim() !== "") thumbBy.set(row.partNum, u.trim());
  }

  const items: PartSubstituteSuggestion[] = slice.map((otherPartNum) => ({
    otherPartNum,
    partName: nameBy.get(otherPartNum) ?? null,
    imgUrl: thumbBy.get(otherPartNum) ?? null,
    relTypes: [...(byOther.get(otherPartNum) ?? new Set())].sort((a, b) => relTypeOrder(a) - relTypeOrder(b)),
  }));

  items.sort((a, b) => {
    const ar = Math.min(...a.relTypes.map(relTypeOrder));
    const br = Math.min(...b.relTypes.map(relTypeOrder));
    if (ar !== br) return ar - br;
    return a.otherPartNum.localeCompare(b.otherPartNum);
  });

  return items;
}
