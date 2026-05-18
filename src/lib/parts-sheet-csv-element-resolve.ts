import { and, inArray } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { elements } from "@/db/schema";

/** CSV 解析后的零件行身份（尚未与目录 enrich） */
export type PartsSheetCsvRowIdentity = {
  partNum: string;
  colorId: number;
  elementId: string | null;
};

function normElementId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

/**
 * 优先用 element_id 对照本地 `elements` 表得到 part_num / color_id；
 * 无 element_id 时按 part+color 回填目录中该配色下的一个 element_id（取最小 id）。
 */
export async function resolvePartsSheetCsvRowIdentities(
  rows: readonly PartsSheetCsvRowIdentity[]
): Promise<PartsSheetCsvRowIdentity[]> {
  if (rows.length === 0) return [];

  const elementIds = [
    ...new Set(rows.map((r) => normElementId(r.elementId)).filter((id): id is string => id != null)),
  ];
  const partNums = [...new Set(rows.map((r) => r.partNum))];

  const byElementId = new Map<string, { partNum: string; colorId: number }>();
  const elementIdByPartColor = new Map<string, string>();

  const db = getCatalogDb();

  if (elementIds.length > 0) {
    const hits = await db
      .select({
        elementId: elements.elementId,
        partNum: elements.partNum,
        colorId: elements.colorId,
      })
      .from(elements)
      .where(inArray(elements.elementId, elementIds));
    for (const h of hits) {
      byElementId.set(h.elementId, { partNum: h.partNum, colorId: h.colorId });
    }
  }

  const needsPartColorLookup = rows.some((r) => !normElementId(r.elementId));
  if (needsPartColorLookup && partNums.length > 0) {
    const colorIds = [...new Set(rows.map((r) => r.colorId))];
    const elRows = await db
      .select({
        elementId: elements.elementId,
        partNum: elements.partNum,
        colorId: elements.colorId,
      })
      .from(elements)
      .where(and(inArray(elements.partNum, partNums), inArray(elements.colorId, colorIds)));
    for (const e of elRows) {
      const key = `${e.partNum}\t${e.colorId}`;
      const prev = elementIdByPartColor.get(key);
      if (!prev || e.elementId < prev) {
        elementIdByPartColor.set(key, e.elementId);
      }
    }
  }

  return rows.map((r) => {
    const eid = normElementId(r.elementId);
    if (eid && byElementId.has(eid)) {
      const hit = byElementId.get(eid)!;
      return { partNum: hit.partNum, colorId: hit.colorId, elementId: eid };
    }
    const key = `${r.partNum}\t${r.colorId}`;
    const inferred = elementIdByPartColor.get(key) ?? null;
    return {
      partNum: r.partNum,
      colorId: r.colorId,
      elementId: eid ?? inferred,
    };
  });
}
