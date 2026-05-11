"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocProfiles, mocSavedPartsSheets } from "@/db/schema";
import { MOC_PROFILE_MAX_DISPLAY_NAME, serializeTagsJson } from "@/lib/moc-profile-parse";
import {
  parseMocDisplayNameFromFilename,
  parseMocSheetItems,
  parseStoredMocDualSheets,
  dualSheetsToPayloadV2,
  type StoredMocDualSheets,
} from "@/lib/parts-sheet-moc-id";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

const MAX_MOC_ID_LEN = 128;
const MAX_ITEMS = 100_000;

export type InitialMocSheetFromServer = {
  mocId: string;
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  savedAt: string;
};

export type MocSheetBranchLoaded = {
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  savedAt: string;
  totalPartQty: number;
};

export type LoadMocPartsSheetResult =
  | {
      ok: true;
      mocId: string;
      full: MocSheetBranchLoaded | null;
      shortage: MocSheetBranchLoaded | null;
    }
  | { ok: false; error: string };

function branchTotals(items: ShortageResolveItem[]): number {
  return items.reduce((s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0), 0);
}

function toLoadedBranch(
  skippedHeader: boolean,
  items: ShortageResolveItem[],
  savedAt: string
): MocSheetBranchLoaded {
  return {
    skippedHeader,
    items,
    savedAt,
    totalPartQty: branchTotals(items),
  };
}

/** 是否已有该 MOC 的已存零件表（用于列表直传前的重复提示） */
export async function mocHasSavedPartsSheet(mocIdRaw: string): Promise<boolean> {
  const mocId = mocIdRaw.trim();
  if (!mocId || mocId.length > MAX_MOC_ID_LEN) return false;
  try {
    const db = getDb();
    const rows = await db
      .select({ mocId: mocSavedPartsSheets.mocId })
      .from(mocSavedPartsSheets)
      .where(eq(mocSavedPartsSheets.mocId, mocId))
      .limit(1);
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

export async function loadMocPartsSheetFromDb(mocIdRaw: string): Promise<LoadMocPartsSheetResult> {
  const mocId = mocIdRaw.trim();
  if (!mocId || mocId.length > MAX_MOC_ID_LEN) {
    return { ok: false, error: "请填写有效的 MOC ID。" };
  }

  try {
    const db = getDb();
    const rows = await db
      .select({ payloadJson: mocSavedPartsSheets.payloadJson })
      .from(mocSavedPartsSheets)
      .where(eq(mocSavedPartsSheets.mocId, mocId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { ok: false, error: `数据库中未找到 MOC ${mocId} 的已存零件表。` };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payloadJson) as unknown;
    } catch {
      return { ok: false, error: "数据库中已存数据损坏，无法解析。" };
    }

    const dual = parseStoredMocDualSheets(parsed);
    if (!dual || (!dual.full && !dual.shortage)) {
      return { ok: false, error: "已存数据无效或为空。" };
    }

    return {
      ok: true,
      mocId,
      full: dual.full
        ? toLoadedBranch(dual.full.skippedHeader, dual.full.items, dual.full.savedAt)
        : null,
      shortage: dual.shortage
        ? toLoadedBranch(dual.shortage.skippedHeader, dual.shortage.items, dual.shortage.savedAt)
        : null,
    };
  } catch {
    return { ok: false, error: "读取数据库失败。" };
  }
}

export type SaveMocPartsSheetResult = { ok: true; savedAt: string } | { ok: false; error: string };

function aggregateRowFromDual(dual: StoredMocDualSheets): {
  skippedHeader: boolean;
  lineCount: number;
  totalPartQty: number;
} {
  const primary = dual.full ?? dual.shortage;
  if (!primary) {
    return { skippedHeader: false, lineCount: 0, totalPartQty: 0 };
  }
  return {
    skippedHeader: primary.skippedHeader,
    lineCount: primary.items.length,
    totalPartQty: branchTotals(primary.items),
  };
}

export async function saveMocPartsSheetToDb(input: {
  mocId: string;
  /** 写入完整零件表或缺件表；另一侧在库中保留 */
  kind: "full" | "shortage";
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  /** 原始导入文件名：用于在尚无显示名时写入 `moc_profiles.display_name`（仅 kind=full 时尝试） */
  sourceFileName?: string | null;
}): Promise<SaveMocPartsSheetResult> {
  const mocId = input.mocId.trim();
  if (!mocId || mocId.length > MAX_MOC_ID_LEN) {
    return { ok: false, error: `mocId 须为非空且不超过 ${MAX_MOC_ID_LEN} 字符。` };
  }

  if (input.kind !== "full" && input.kind !== "shortage") {
    return { ok: false, error: "kind 须为 full 或 shortage。" };
  }

  if (typeof input.skippedHeader !== "boolean") {
    return { ok: false, error: "skippedHeader 须为布尔值。" };
  }

  const items = parseMocSheetItems(input.items);
  if (!items || items.length === 0) {
    return { ok: false, error: "items 须为非空且格式正确的零件行数组。" };
  }
  if (items.length > MAX_ITEMS) {
    return { ok: false, error: `行数超过上限 ${MAX_ITEMS}。` };
  }

  const savedAt = new Date().toISOString();
  const newBranch = {
    skippedHeader: input.skippedHeader,
    items,
    savedAt,
  };

  const rawSourceName = input.sourceFileName;
  const sourceFileName = typeof rawSourceName === "string" ? rawSourceName : "";
  const fromFileTitle =
    input.kind === "full" && sourceFileName.trim().length > 0
      ? parseMocDisplayNameFromFilename(sourceFileName, mocId)?.trim().slice(0, MOC_PROFILE_MAX_DISPLAY_NAME) ?? ""
      : "";

  try {
    const db = getDb();
    db.transaction((tx) => {
      const existingRows = tx
        .select({ payloadJson: mocSavedPartsSheets.payloadJson })
        .from(mocSavedPartsSheets)
        .where(eq(mocSavedPartsSheets.mocId, mocId))
        .limit(1)
        .all();
      const existingJson = existingRows[0]?.payloadJson;
      let dual: StoredMocDualSheets = { full: null, shortage: null };
      if (existingJson) {
        try {
          const parsed = JSON.parse(existingJson) as unknown;
          const prev = parseStoredMocDualSheets(parsed);
          if (prev) dual = prev;
        } catch {
          /* 忽略损坏的旧行，以下方新数据为准 */
        }
      }

      if (input.kind === "full") {
        dual = { ...dual, full: newBranch };
      } else {
        dual = { ...dual, shortage: newBranch };
      }

      if (!dual.full && !dual.shortage) {
        throw new Error("internal: empty dual");
      }

      const payload = dualSheetsToPayloadV2(dual);
      const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(dual);

      tx.insert(mocSavedPartsSheets)
        .values({
          mocId,
          skippedHeader,
          payloadJson: JSON.stringify(payload),
          lineCount,
          totalPartQty,
          updatedAt: savedAt,
        })
        .onConflictDoUpdate({
          target: mocSavedPartsSheets.mocId,
          set: {
            skippedHeader,
            payloadJson: JSON.stringify(payload),
            lineCount,
            totalPartQty,
            updatedAt: savedAt,
          },
        })
        .run();

      if (!fromFileTitle) return;

      const profRows = tx
        .select({ displayName: mocProfiles.displayName, tagsJson: mocProfiles.tagsJson })
        .from(mocProfiles)
        .where(eq(mocProfiles.mocId, mocId))
        .limit(1)
        .all();
      const prof = profRows[0];
      if ((prof?.displayName ?? "").trim() !== "") return;

      tx.insert(mocProfiles)
        .values({
          mocId,
          displayName: fromFileTitle,
          tagsJson: prof?.tagsJson ?? serializeTagsJson([]),
          profileUpdatedAt: savedAt,
        })
        .onConflictDoUpdate({
          target: mocProfiles.mocId,
          set: {
            displayName: fromFileTitle,
            profileUpdatedAt: savedAt,
          },
        })
        .run();
    });

    revalidatePath("/mocs");
    revalidatePath(`/mocs/${encodeURIComponent(mocId)}`);
    return { ok: true, savedAt };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
}
