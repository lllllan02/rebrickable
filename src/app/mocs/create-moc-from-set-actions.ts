"use server";

import { and, eq, like } from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildAttachments,
  buildImages,
  buildProfiles,
  buildSavedPartsSheets,
  legoSets,
} from "@/db/schema";
import { ensureWorkflowCollected } from "@/lib/ensure-workflow-collected";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, isSafeBuildSubjectId } from "@/lib/build-subject";
import {
  formatMocIdFromSetDerivation,
  nextMocDerivationSequence,
} from "@/lib/moc-from-set-id";
import { serializeTagsJson } from "@/lib/moc-profile-parse";
import {
  dualSheetsToPayloadV2,
  type StoredMocDualSheets,
} from "@/lib/parts-sheet-moc-id";
import { loadSetOfficialInventoryResolveItems } from "@/lib/set-official-inventory-resolve-items";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

export type CreateMocFromSetResult =
  | { ok: true; mocId: string }
  | { ok: false; error: string };

async function collectExistingDerivedMocIds(setNum: string): Promise<Set<string>> {
  const db = getUserDb();
  const pattern = `${setNum}-%`;
  const kind = BUILD_SUBJECT_MOC;
  const keyLike = and(eq(buildProfiles.subjectKind, kind), like(buildProfiles.subjectId, pattern));

  const [profRows, sheetRows, imgRows, attRows] = await Promise.all([
    db.select({ subjectId: buildProfiles.subjectId }).from(buildProfiles).where(keyLike),
    db
      .select({ subjectId: buildSavedPartsSheets.subjectId })
      .from(buildSavedPartsSheets)
      .where(and(eq(buildSavedPartsSheets.subjectKind, kind), like(buildSavedPartsSheets.subjectId, pattern))),
    db
      .select({ subjectId: buildImages.subjectId })
      .from(buildImages)
      .where(and(eq(buildImages.subjectKind, kind), like(buildImages.subjectId, pattern))),
    db
      .select({ subjectId: buildAttachments.subjectId })
      .from(buildAttachments)
      .where(and(eq(buildAttachments.subjectKind, kind), like(buildAttachments.subjectId, pattern))),
  ]);

  const ids = new Set<string>();
  for (const r of profRows) ids.add(r.subjectId);
  for (const r of sheetRows) ids.add(r.subjectId);
  for (const r of imgRows) ids.add(r.subjectId);
  for (const r of attRows) ids.add(r.subjectId);
  return ids;
}

function aggregateRowFromDual(dual: StoredMocDualSheets): {
  skippedHeader: boolean;
  lineCount: number;
  totalPartQty: number;
} {
  const primary = dual.full ?? dual.shortage ?? dual.fulfillment;
  if (!primary) return { skippedHeader: false, lineCount: 0, totalPartQty: 0 };
  const totalPartQty = primary.items.reduce(
    (s, i) => s + (Number.isFinite(i.quantity) ? i.quantity : 0),
    0
  );
  return {
    skippedHeader: primary.skippedHeader,
    lineCount: primary.items.length,
    totalPartQty,
  };
}

/** 从官方套装创建改编 MOC（`{setNum}-001` …），并以官方库存初始化完整零件表 */
export async function createMocFromSetAction(setNumRaw: string): Promise<CreateMocFromSetResult> {
  const setNum = setNumRaw.trim();
  if (!setNum || setNum.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "套装编号无效。" };
  }

  const catalogDb = getCatalogDb();
  const [catalog] = await catalogDb
    .select({ name: legoSets.name })
    .from(legoSets)
    .where(eq(legoSets.setNum, setNum))
    .limit(1);
  if (!catalog) {
    return { ok: false, error: "目录中未找到该套装。" };
  }

  const items = await loadSetOfficialInventoryResolveItems(setNum);
  if (items.length === 0) {
    return { ok: false, error: "该套装暂无官方库存行，无法创建改编 MOC。" };
  }

  const existingIds = await collectExistingDerivedMocIds(setNum);
  const seq = nextMocDerivationSequence(setNum, existingIds);
  let mocId: string;
  try {
    mocId = formatMocIdFromSetDerivation(setNum, seq);
  } catch {
    return { ok: false, error: "无法分配改编 MOC 编号。" };
  }

  if (!isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return { ok: false, error: "生成的 MOC ID 无效。" };
  }
  if (existingIds.has(mocId)) {
    return { ok: false, error: "该改编编号已存在，请刷新后重试。" };
  }

  const savedAt = new Date().toISOString();
  const dual: StoredMocDualSheets = {
    full: { skippedHeader: false, items, savedAt },
    shortage: null,
    fulfillment: null,
  };
  const payload = dualSheetsToPayloadV2(dual);
  const { skippedHeader, lineCount, totalPartQty } = aggregateRowFromDual(dual);
  const displayName = (catalog.name ?? "").trim();
  const profileUpdatedAt = savedAt;

  try {
    const db = getUserDb();
    db.transaction((tx) => {
      tx.insert(buildProfiles)
        .values({
          subjectKind: BUILD_SUBJECT_MOC,
          subjectId: mocId,
          displayName,
          tagsJson: serializeTagsJson([]),
          profileUpdatedAt,
          derivedFromSetNum: setNum,
        })
        .run();

      tx.insert(buildSavedPartsSheets)
        .values({
          subjectKind: BUILD_SUBJECT_MOC,
          subjectId: mocId,
          skippedHeader,
          payloadJson: JSON.stringify(payload),
          lineCount,
          totalPartQty,
          updatedAt: savedAt,
          firstSavedAt: savedAt,
          shortageLineCount: null,
          shortageTotalQty: null,
          shortageStatsOk: true,
          shortageClearedAt: null,
          gobricksGdsPriceCny: 0,
        })
        .run();
    });

    await ensureWorkflowCollected(BUILD_SUBJECT_MOC, mocId);
    revalidateBuildSubjectPaths(BUILD_SUBJECT_MOC, mocId);
    revalidateBuildSubjectPaths(BUILD_SUBJECT_SET, setNum);
    return { ok: true, mocId };
  } catch {
    return { ok: false, error: "创建失败，请重试。" };
  }
}
