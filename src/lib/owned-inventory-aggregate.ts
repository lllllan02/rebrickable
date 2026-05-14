import "server-only";

import { and, eq, inArray, max } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import {
  buildOwnedSubjects,
  buildSavedPartsSheets,
  inventories,
  inventoryParts,
} from "@/db/schema";
import { OWNED_SUBJECT_PART } from "@/lib/build-owned-subject";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { parseStoredMocDualSheets } from "@/lib/parts-sheet-moc-id";

export type OwnedPartInventoryRow = {
  partNum: string;
  totalQty: number;
  looseQty: number;
  fromSetQty: number;
  fromMocQty: number;
};

const MAX_LIST_ROWS = 500;

function safeQty(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), 1_000_000_000);
}

type Acc = { loose: number; fromSet: number; fromMoc: number };

function bump(acc: Map<string, Acc>, partNum: string, field: keyof Acc, q: number) {
  if (q <= 0) return;
  const cur = acc.get(partNum) ?? { loose: 0, fromSet: 0, fromMoc: 0 };
  cur[field] += q;
  acc.set(partNum, cur);
}

/**
 * 将「散装拥有」与已拥有套装 / MOC 的零件表（套装用官方 inventory；MOC 用已存完整表，否则缺件表）按零件号汇总。
 */
export async function aggregateOwnedPartInventory(): Promise<{
  rows: OwnedPartInventoryRow[];
  truncated: boolean;
}> {
  const db = getUserDb();
  const owned = await db.select().from(buildOwnedSubjects);

  const setNums: string[] = [];
  const mocIds: string[] = [];
  for (const r of owned) {
    if (r.subjectKind === BUILD_SUBJECT_SET) setNums.push(r.subjectId);
    else if (r.subjectKind === BUILD_SUBJECT_MOC) mocIds.push(r.subjectId);
  }

  const acc = new Map<string, Acc>();

  for (const r of owned) {
    if (r.subjectKind === OWNED_SUBJECT_PART) {
      const raw = typeof r.quantity === "number" && Number.isFinite(r.quantity) ? Math.floor(r.quantity) : 1;
      bump(acc, r.subjectId, "loose", Math.max(1, raw));
    }
  }

  if (setNums.length > 0) {
    const invLatest = db
      .select({
        setNum: inventories.setNum,
        maxVersion: max(inventories.version).as("max_version"),
      })
      .from(inventories)
      .where(inArray(inventories.setNum, setNums))
      .groupBy(inventories.setNum)
      .as("inv_latest");

    const invPick = await db
      .select({ id: inventories.id })
      .from(inventories)
      .innerJoin(
        invLatest,
        and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
      );

    const invIds = invPick.map((x) => x.id).filter((id) => Number.isFinite(id));
    const setsWithInventoryLines = new Set<string>();
    if (invIds.length > 0) {
      const lines = await db
        .select({
          setNum: inventories.setNum,
          partNum: inventoryParts.partNum,
          quantity: inventoryParts.quantity,
        })
        .from(inventoryParts)
        .innerJoin(inventories, eq(inventoryParts.inventoryId, inventories.id))
        .where(inArray(inventoryParts.inventoryId, invIds));
      for (const line of lines) {
        const q = safeQty(line.quantity);
        if (q <= 0) continue;
        setsWithInventoryLines.add(line.setNum);
        bump(acc, line.partNum, "fromSet", q);
      }
    }

    const setsSheetOnly = setNums.filter((s) => !setsWithInventoryLines.has(s));
    if (setsSheetOnly.length > 0) {
      const setSheets = await db
        .select({ subjectId: buildSavedPartsSheets.subjectId, payloadJson: buildSavedPartsSheets.payloadJson })
        .from(buildSavedPartsSheets)
        .where(
          and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_SET), inArray(buildSavedPartsSheets.subjectId, setsSheetOnly))
        );
      for (const sr of setSheets) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(sr.payloadJson) as unknown;
        } catch {
          continue;
        }
        const dual = parseStoredMocDualSheets(parsed);
        const branch = dual?.full ?? dual?.shortage;
        if (!branch?.items?.length) continue;
        for (const it of branch.items) {
          const q = safeQty(it.quantity);
          if (q > 0) bump(acc, it.partNum, "fromSet", q);
        }
      }
    }
  }

  if (mocIds.length > 0) {
    const sheetRows = await db
      .select({ subjectId: buildSavedPartsSheets.subjectId, payloadJson: buildSavedPartsSheets.payloadJson })
      .from(buildSavedPartsSheets)
      .where(and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC), inArray(buildSavedPartsSheets.subjectId, mocIds)));

    for (const sr of sheetRows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(sr.payloadJson) as unknown;
      } catch {
        continue;
      }
      const dual = parseStoredMocDualSheets(parsed);
      const branch = dual?.full ?? dual?.shortage;
      if (!branch?.items?.length) continue;
      for (const it of branch.items) {
        const q = safeQty(it.quantity);
        if (q > 0) bump(acc, it.partNum, "fromMoc", q);
      }
    }
  }

  const rows: OwnedPartInventoryRow[] = [...acc.entries()]
    .map(([partNum, v]) => ({
      partNum,
      looseQty: v.loose,
      fromSetQty: v.fromSet,
      fromMocQty: v.fromMoc,
      totalQty: v.loose + v.fromSet + v.fromMoc,
    }))
    .filter((r) => r.totalQty > 0)
    .sort((a, b) => a.partNum.localeCompare(b.partNum));

  const truncated = rows.length > MAX_LIST_ROWS;
  return { rows: rows.slice(0, MAX_LIST_ROWS), truncated };
}
