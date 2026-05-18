import {
  loadIoBatchPartsSheetFromDb,
  saveIoBatchPartsSheetToDb,
  setGobricksShortageSyncAtForIoBatch,
} from "@/app/mocs/io-batch-parts-sheet-actions";
import {
  clearFulfillmentBranchInDb,
  saveBuildPartsSheetToDb,
  setGobricksShortageSyncAtInDb,
  stripShortageBranchKeepingFullInDb,
} from "@/app/mocs/moc-parts-sheet-actions";
import { enrichGobricksSheetRowsWithColorNames } from "@/lib/gobricks-item-filter-inventory";
import {
  bomToGobricksTestList,
  fetchGobricksLego2MergedPayload,
  fulfillmentSerializeRowsFromGobricksPayload,
  readGdsPriceCnyFromMergedGobricksPayload,
  shortageSerializeRowsFromGobricksPayload,
} from "@/lib/gobricks-lego2-item-list";
import { resolveGobricksSheetSerializedRowsInDb } from "@/lib/parts-sheet-resolve-csv-db";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { loadSetOfficialInventoryBomLines } from "@/lib/set-official-inventory-bom";
import { restHasSheetRowReplacedMarker } from "@/lib/sheet-row-replaced-marker";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

const GOBRICKS_TIMEOUT_MS = 45_000;

export type GobricksSyncApplyResult =
  | { ok: true; shortageLines: number; fulfillmentLines: number; message: string }
  | { ok: false; error: string }
  | { ok: false; needsConfirmOverwriteModified: true; message: string };

function branchHasReplaceMarker(branch: { items: ShortageResolveItem[] } | null): boolean {
  return Boolean(branch?.items.some((r) => restHasSheetRowReplacedMarker(r.rest)));
}

async function clearFulfillmentBranchForIoBatch(batchId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadIoBatchPartsSheetFromDb(batchId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  if (!loaded.fulfillment) return { ok: true };
  if (loaded.full) {
    const r = await saveIoBatchPartsSheetToDb({
      batchId,
      kind: "full",
      skippedHeader: loaded.full.skippedHeader,
      items: loaded.full.items,
    });
    return r.ok ? { ok: true } : r;
  }
  return { ok: true };
}

/**
 * 用当前完整表 BOM 请求高砖，写入配货表（高砖可购零件）与缺件表。
 * Studio 完整表保留在 `full` 分支，仅供再次对照；分包方案展示读 `fulfillment`。
 */
export async function applyGobricksSyncForIoBatch(
  batchId: number,
  options?: { confirmOverwriteModified?: boolean },
): Promise<GobricksSyncApplyResult> {
  const preloaded = await loadIoBatchPartsSheetFromDb(batchId);
  if (!preloaded.ok) return { ok: false, error: preloaded.error };
  if (!preloaded.full?.items.length) {
    return { ok: false, error: "该包没有完整零件表，无法对照高砖。" };
  }

  const hasModified =
    branchHasReplaceMarker(preloaded.shortage) || branchHasReplaceMarker(preloaded.fulfillment);
  if (hasModified && !options?.confirmOverwriteModified) {
    return {
      ok: false,
      needsConfirmOverwriteModified: true,
      message:
        "当前缺件表或配货表中含有已手动更换的零件行，从高砖同步将覆盖这些修改。确定继续？",
    };
  }

  const bom = preloaded.full.items.map((i) => ({
    partNum: i.partNum,
    colorId: i.colorId,
    quantity: i.quantity,
  }));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOBRICKS_TIMEOUT_MS);

  let merged: unknown;
  try {
    merged = await fetchGobricksLego2MergedPayload(bomToGobricksTestList(bom), {
      signal: controller.signal,
    });
  } catch (e) {
    const msg = controller.signal.aborted
      ? "请求高砖超时。"
      : e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "请求高砖失败，请稍后重试。";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }

  const shortageSerialized = shortageSerializeRowsFromGobricksPayload(merged);
  const fulfillmentSerialized = fulfillmentSerializeRowsFromGobricksPayload(merged);

  const enrichTimer = setTimeout(() => controller.abort(), GOBRICKS_TIMEOUT_MS);
  let shortageEnriched = shortageSerialized.rows;
  let fulfillmentEnriched = fulfillmentSerialized.rows;
  try {
    [shortageEnriched, fulfillmentEnriched] = await Promise.all([
      enrichGobricksSheetRowsWithColorNames(shortageEnriched, { signal: controller.signal }),
      enrichGobricksSheetRowsWithColorNames(fulfillmentEnriched, { signal: controller.signal }),
    ]);
  } finally {
    clearTimeout(enrichTimer);
  }

  const shortageResolved = await resolveGobricksSheetSerializedRowsInDb(shortageEnriched);
  if (!shortageResolved.ok) return { ok: false, error: shortageResolved.error };

  const fulfillmentResolved = await resolveGobricksSheetSerializedRowsInDb(fulfillmentEnriched);
  if (!fulfillmentResolved.ok) return { ok: false, error: fulfillmentResolved.error };

  const gdsPriceCny = readGdsPriceCnyFromMergedGobricksPayload(merged);
  const shortageLines = shortageResolved.items.length;
  const fulfillmentLines = fulfillmentResolved.items.length;

  if (fulfillmentLines > 0) {
    const fs = await saveIoBatchPartsSheetToDb({
      batchId,
      kind: "fulfillment",
      skippedHeader: fulfillmentResolved.skippedHeader,
      items: fulfillmentResolved.items,
    });
    if (!fs.ok) return { ok: false, error: fs.error };
  } else {
    const clr = await clearFulfillmentBranchForIoBatch(batchId);
    if (!clr.ok) return { ok: false, error: clr.error };
  }

  if (shortageLines > 0) {
    const save = await saveIoBatchPartsSheetToDb({
      batchId,
      kind: "shortage",
      skippedHeader: shortageResolved.skippedHeader,
      items: shortageResolved.items,
    });
    if (!save.ok) return { ok: false, error: save.error };
    await setGobricksShortageSyncAtForIoBatch(batchId, new Date().toISOString(), gdsPriceCny);
    return {
      ok: true,
      shortageLines,
      fulfillmentLines,
      message:
        `已写入 ${shortageLines.toLocaleString("zh-CN")} 条缺件` +
        (fulfillmentLines > 0
          ? `、${fulfillmentLines.toLocaleString("zh-CN")} 条高砖可购零件。`
          : "；高砖未返回可购零件行。"),
    };
  }

  await setGobricksShortageSyncAtForIoBatch(batchId, new Date().toISOString(), gdsPriceCny);
  return {
    ok: true,
    shortageLines: 0,
    fulfillmentLines,
    message:
      fulfillmentLines > 0
        ? `高砖无缺件；已写入 ${fulfillmentLines.toLocaleString("zh-CN")} 条可购零件。`
        : "高砖未返回可购零件行，也未产生缺件记录。",
  };
}

/** 主 MOC / 套装零件表的高砖同步（非分包批次） */
export async function applyGobricksSyncForBuildSubject(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  confirmOverwriteModified?: boolean;
}): Promise<GobricksSyncApplyResult> {
  const { loadBuildPartsSheetFromDb } = await import("@/app/mocs/moc-parts-sheet-actions");
  const preloaded = await loadBuildPartsSheetFromDb(input.subjectKind, input.subjectId);
  if (!preloaded.ok) return { ok: false, error: preloaded.error };

  const hasModified =
    branchHasReplaceMarker(preloaded.shortage) || branchHasReplaceMarker(preloaded.fulfillment);
  if (hasModified && !input.confirmOverwriteModified) {
    return {
      ok: false,
      needsConfirmOverwriteModified: true,
      message:
        "当前缺件表或配货表中含有已手动更换的零件行，从高砖同步将覆盖这些修改。确定继续？",
    };
  }

  let bom: { partNum: string; colorId: number; quantity: number }[] = [];
  if (input.subjectKind === BUILD_SUBJECT_MOC) {
    if (!preloaded.full?.items.length) {
      return { ok: false, error: "请先上传并保存完整零件表。" };
    }
    bom = preloaded.full.items.map((i) => ({
      partNum: i.partNum,
      colorId: i.colorId,
      quantity: i.quantity,
    }));
  } else {
    bom = await loadSetOfficialInventoryBomLines(input.subjectId);
    if (bom.length === 0) {
      return { ok: false, error: "本地无该套装官方库存，无法对照高砖。" };
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOBRICKS_TIMEOUT_MS);
  let merged: unknown;
  try {
    merged = await fetchGobricksLego2MergedPayload(bomToGobricksTestList(bom), {
      signal: controller.signal,
    });
  } catch (e) {
    const msg = controller.signal.aborted
      ? "请求高砖超时。"
      : e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "请求高砖失败，请稍后重试。";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }

  const shortageSerialized = shortageSerializeRowsFromGobricksPayload(merged);
  const fulfillmentSerialized = fulfillmentSerializeRowsFromGobricksPayload(merged);
  const enrichTimer = setTimeout(() => controller.abort(), GOBRICKS_TIMEOUT_MS);
  let shortageEnriched = shortageSerialized.rows;
  let fulfillmentEnriched = fulfillmentSerialized.rows;
  try {
    [shortageEnriched, fulfillmentEnriched] = await Promise.all([
      enrichGobricksSheetRowsWithColorNames(shortageEnriched, { signal: controller.signal }),
      enrichGobricksSheetRowsWithColorNames(fulfillmentEnriched, { signal: controller.signal }),
    ]);
  } finally {
    clearTimeout(enrichTimer);
  }

  const shortageResolved = await resolveGobricksSheetSerializedRowsInDb(shortageEnriched);
  if (!shortageResolved.ok) return { ok: false, error: shortageResolved.error };
  const fulfillmentResolved = await resolveGobricksSheetSerializedRowsInDb(fulfillmentEnriched);
  if (!fulfillmentResolved.ok) return { ok: false, error: fulfillmentResolved.error };

  const gdsPriceCny = readGdsPriceCnyFromMergedGobricksPayload(merged);
  const shortageLines = shortageResolved.items.length;
  const fulfillmentLines = fulfillmentResolved.items.length;

  if (fulfillmentLines > 0) {
    const fs = await saveBuildPartsSheetToDb({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      kind: "fulfillment",
      skippedHeader: fulfillmentResolved.skippedHeader,
      items: fulfillmentResolved.items,
      sourceFileName: "高砖配货表.csv",
    });
    if (!fs.ok) return { ok: false, error: fs.error };
  } else {
    const clr = await clearFulfillmentBranchInDb({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
    });
    if (!clr.ok && clr.error !== "尚无已保存的零件表记录。") {
      return { ok: false, error: clr.error };
    }
  }

  if (shortageLines > 0) {
    const save = await saveBuildPartsSheetToDb({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      kind: "shortage",
      skippedHeader: shortageResolved.skippedHeader,
      items: shortageResolved.items,
      sourceFileName: "高砖缺件查询.csv",
    });
    if (!save.ok) return { ok: false, error: save.error };
    await setGobricksShortageSyncAtInDb(
      input.subjectKind,
      input.subjectId,
      new Date().toISOString(),
      gdsPriceCny,
    );
    return {
      ok: true,
      shortageLines,
      fulfillmentLines,
      message:
        `已写入 ${shortageLines.toLocaleString("zh-CN")} 条缺件` +
        (fulfillmentLines > 0 ? `、${fulfillmentLines.toLocaleString("zh-CN")} 条配货。` : "；高砖未返回可配货行，配货表已清空。"),
    };
  }

  if (input.subjectKind === BUILD_SUBJECT_MOC) {
    const strip = await stripShortageBranchKeepingFullInDb({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
    });
    await setGobricksShortageSyncAtInDb(
      input.subjectKind,
      input.subjectId,
      new Date().toISOString(),
      gdsPriceCny,
    );
    if (!strip.ok) {
      return {
        ok: true,
        shortageLines: 0,
        fulfillmentLines,
        message:
          "高砖无缺件；缺件表未写入（无法自动清空已存缺件，请见详情页）。\n\n" +
          (fulfillmentLines > 0
            ? `已写入 ${fulfillmentLines.toLocaleString("zh-CN")} 条配货。`
            : "配货表已清空（高砖未返回可配货行）。"),
      };
    }
    return {
      ok: true,
      shortageLines: 0,
      fulfillmentLines,
      message:
        fulfillmentLines > 0
          ? `高砖无缺件，已清空缺件表；已写入 ${fulfillmentLines.toLocaleString("zh-CN")} 条配货。`
          : "高砖无缺件，已清空缺件表；未返回可配货行，配货表已清空。",
    };
  }

  await setGobricksShortageSyncAtInDb(
    input.subjectKind,
    input.subjectId,
    new Date().toISOString(),
    gdsPriceCny,
  );
  return {
    ok: true,
    shortageLines: 0,
    fulfillmentLines,
    message:
      fulfillmentLines > 0
        ? `高砖无缺件；已存缺件表未更改。已写入 ${fulfillmentLines.toLocaleString("zh-CN")} 条配货。`
        : "高砖无缺件；已存缺件表未更改。未返回可配货行，配货表已清空。",
  };
}
