"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocProfiles, mocSavedPartsSheets } from "@/db/schema";
import { MOC_PROFILE_MAX_DISPLAY_NAME, serializeTagsJson } from "@/lib/moc-profile-parse";
import {
  parseMocDisplayNameFromFilename,
  parseMocSheetItems,
  parseStoredMocPartsSheet,
  type MocPartsSheetPayloadV1,
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

export type LoadMocPartsSheetResult =
  | { ok: true; mocId: string; skippedHeader: boolean; items: ShortageResolveItem[]; savedAt: string }
  | { ok: false; error: string };

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

    const payload = parseStoredMocPartsSheet(parsed);
    if (!payload || payload.items.length === 0) {
      return { ok: false, error: "已存数据无效或为空。" };
    }

    return {
      ok: true,
      mocId,
      skippedHeader: payload.skippedHeader,
      items: payload.items,
      savedAt: payload.savedAt,
    };
  } catch {
    return { ok: false, error: "读取数据库失败。" };
  }
}

export type SaveMocPartsSheetResult = { ok: true; savedAt: string } | { ok: false; error: string };

export async function saveMocPartsSheetToDb(input: {
  mocId: string;
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  /** 原始导入文件名：用于在尚无显示名时写入 `moc_profiles.display_name` */
  sourceFileName?: string | null;
}): Promise<SaveMocPartsSheetResult> {
  const mocId = input.mocId.trim();
  if (!mocId || mocId.length > MAX_MOC_ID_LEN) {
    return { ok: false, error: `mocId 须为非空且不超过 ${MAX_MOC_ID_LEN} 字符。` };
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
  const payload: MocPartsSheetPayloadV1 = {
    version: 1,
    skippedHeader: input.skippedHeader,
    items,
    savedAt,
  };

  const rawSourceName = input.sourceFileName;
  const sourceFileName = typeof rawSourceName === "string" ? rawSourceName : "";
  const fromFileTitle =
    sourceFileName.trim().length > 0
      ? parseMocDisplayNameFromFilename(sourceFileName, mocId)?.trim().slice(0, MOC_PROFILE_MAX_DISPLAY_NAME) ?? ""
      : "";

  try {
    const db = getDb();
    db.transaction((tx) => {
      tx.insert(mocSavedPartsSheets)
        .values({
          mocId,
          skippedHeader: input.skippedHeader,
          payloadJson: JSON.stringify(payload),
          lineCount: items.length,
          updatedAt: savedAt,
        })
        .onConflictDoUpdate({
          target: mocSavedPartsSheets.mocId,
          set: {
            skippedHeader: input.skippedHeader,
            payloadJson: JSON.stringify(payload),
            lineCount: items.length,
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
    revalidatePath("/mocs/import");
    revalidatePath(`/mocs/${encodeURIComponent(mocId)}`);
    return { ok: true, savedAt };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
}
