import "server-only";

import { and, inArray, isNotNull, min, ne } from "drizzle-orm";

import { loadMocPartsSheetFromDb } from "@/app/mocs/moc-parts-sheet-actions";
import { getCatalogDb } from "@/db/client";
import { inventoryParts, parts } from "@/db/schema";
import { BUILD_SUBJECT_MOC, isSafeBuildSubjectId } from "@/lib/build-subject";
import { loadFavoritePartNums } from "@/lib/load-favorite-parts";
import { loadPurchaseListPartNums } from "@/lib/load-purchase-list";
import {
  computeMocPartUsageStats,
  type MocPartUsageEnrichedRow,
  type MocPartUsageInputSheet,
  type MocPartUsageSkipped,
  type MocPartUsageStatRow,
} from "@/lib/moc-part-usage-stats";

export type { MocPartUsageEnrichedRow, MocPartUsageSkipped };

export const MOC_PART_USAGE_MAX_MOCS = 100;
const MAX_SUBJECT_ID_LEN = 128;

export type MocPartUsageComputeResult = {
  analyzedMocIds: string[];
  skipped: MocPartUsageSkipped[];
  rows: MocPartUsageEnrichedRow[];
  /** 可序列化进 results_json 的纯指标行 */
  statRows: MocPartUsageStatRow[];
};

/** 规范化并去重 mocId；超过上限返回 null */
export function normalizeMocPartUsageIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || id.length > MAX_SUBJECT_ID_LEN) continue;
    if (!isSafeBuildSubjectId(BUILD_SUBJECT_MOC, id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length > MOC_PART_USAGE_MAX_MOCS) return null;
  }
  return out;
}

export function serializeMocPartUsageStatRows(rows: MocPartUsageStatRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      partNum: r.partNum,
      score: r.score,
      coverage: r.coverage,
      mocCount: r.mocCount,
      selectedMocCount: r.selectedMocCount,
      relMeanAmongUsers: r.relMeanAmongUsers,
      totalQtyAcrossMocs: r.totalQtyAcrossMocs,
    }))
  );
}

export function parseMocPartUsageStatRows(raw: string): MocPartUsageStatRow[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: MocPartUsageStatRow[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const partNum = typeof o.partNum === "string" ? o.partNum.trim() : "";
    if (!partNum) continue;
    const score = Number(o.score);
    const coverage = Number(o.coverage);
    const mocCount = Number(o.mocCount);
    const selectedMocCount = Number(o.selectedMocCount);
    const relMeanAmongUsers = Number(o.relMeanAmongUsers);
    const totalQtyAcrossMocs = Number(o.totalQtyAcrossMocs);
    if (
      ![score, coverage, mocCount, selectedMocCount, relMeanAmongUsers, totalQtyAcrossMocs].every(
        (n) => Number.isFinite(n)
      )
    ) {
      continue;
    }
    out.push({
      partNum,
      score,
      coverage,
      mocCount,
      selectedMocCount,
      relMeanAmongUsers,
      totalQtyAcrossMocs,
    });
  }
  return out;
}

async function enrichStatRows(statRows: MocPartUsageStatRow[]): Promise<MocPartUsageEnrichedRow[]> {
  const partNums = statRows.map((r) => r.partNum);
  const nameByPart = new Map<string, string>();
  const thumbByPart = new Map<string, string>();

  if (partNums.length > 0) {
    const catalogDb = getCatalogDb();
    const CHUNK = 400;
    for (let i = 0; i < partNums.length; i += CHUNK) {
      const chunk = partNums.slice(i, i + CHUNK);
      const [nameRows, thumbRows] = await Promise.all([
        catalogDb
          .select({ partNum: parts.partNum, name: parts.name })
          .from(parts)
          .where(inArray(parts.partNum, chunk)),
        catalogDb
          .select({
            partNum: inventoryParts.partNum,
            thumb: min(inventoryParts.imgUrl),
          })
          .from(inventoryParts)
          .where(
            and(
              inArray(inventoryParts.partNum, chunk),
              isNotNull(inventoryParts.imgUrl),
              ne(inventoryParts.imgUrl, "")
            )
          )
          .groupBy(inventoryParts.partNum),
      ]);
      for (const r of nameRows) nameByPart.set(r.partNum, r.name);
      for (const r of thumbRows) {
        if (r.thumb) thumbByPart.set(r.partNum, r.thumb);
      }
    }
  }

  const [favSet, purchaseSet] = await Promise.all([
    loadFavoritePartNums(partNums),
    loadPurchaseListPartNums(partNums),
  ]);

  return statRows.map((r) => ({
    ...r,
    partName: nameByPart.get(r.partNum) ?? null,
    imgUrl: thumbByPart.get(r.partNum) ?? null,
    inPurchaseList: purchaseSet.has(r.partNum),
    isFavorite: favSet.has(r.partNum),
  }));
}

/** 对指定 mocId 列表加载 full 表并计算使用率 */
export async function computeMocPartUsageForMocIds(
  mocIds: string[]
): Promise<MocPartUsageComputeResult> {
  const skipped: MocPartUsageSkipped[] = [];
  const sheets: MocPartUsageInputSheet[] = [];

  for (const mocId of mocIds) {
    const loaded = await loadMocPartsSheetFromDb(mocId);
    if (!loaded.ok) {
      skipped.push({ mocId, reason: loaded.error });
      continue;
    }
    const full = loaded.full;
    if (!full || full.items.length === 0) {
      skipped.push({ mocId, reason: "无完整零件表" });
      continue;
    }
    sheets.push({
      mocId,
      items: full.items.map((i) => ({ partNum: i.partNum, quantity: i.quantity })),
    });
  }

  const stats = computeMocPartUsageStats(sheets);
  const analyzedSet = new Set(stats.analyzedMocIds);
  for (const s of sheets) {
    if (!analyzedSet.has(s.mocId)) {
      skipped.push({ mocId: s.mocId, reason: "完整零件表无有效零件数量" });
    }
  }

  const rows = await enrichStatRows(stats.rows);
  return {
    analyzedMocIds: stats.analyzedMocIds,
    skipped,
    rows,
    statRows: stats.rows,
  };
}

/** 从缓存的指标行补全展示字段 */
export async function enrichMocPartUsageStatRows(
  statRows: MocPartUsageStatRow[]
): Promise<MocPartUsageEnrichedRow[]> {
  return enrichStatRows(statRows);
}
