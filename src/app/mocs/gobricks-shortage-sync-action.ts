"use server";

import {
  clearFulfillmentBranchInDb,
  loadBuildPartsSheetFromDb,
  saveBuildPartsSheetToDb,
  setGobricksShortageSyncAtInDb,
  stripShortageBranchKeepingFullInDb,
} from "@/app/mocs/moc-parts-sheet-actions";
import {
  bomToGobricksTestList,
  fetchGobricksLego2MergedPayload,
  fulfillmentSerializeRowsFromGobricksPayload,
  readGdsPriceCnyFromMergedGobricksPayload,
  shortageSerializeRowsFromGobricksPayload,
} from "@/lib/gobricks-lego2-item-list";
import { resolveGobricksSheetSerializedRowsInDb } from "@/lib/parts-sheet-resolve-csv-db";
import { BUILD_SUBJECT_MOC, isSafeBuildSubjectId, type BuildSubjectKind } from "@/lib/build-subject";
import { loadSetOfficialInventoryBomLines } from "@/lib/set-official-inventory-bom";

const MAX_SUBJECT_ID_LEN = 128;
const GOBRICKS_TIMEOUT_MS = 45_000;

function subjectKindLabel(kind: BuildSubjectKind): string {
  return kind === BUILD_SUBJECT_MOC ? "MOC" : "套装";
}

async function recordGobricksShortageSyncOk(
  subjectKind: BuildSubjectKind,
  subjectId: string,
  gdsPriceCny: number
) {
  try {
    await setGobricksShortageSyncAtInDb(subjectKind, subjectId, new Date().toISOString(), gdsPriceCny);
  } catch {
    /* 戳记失败不阻塞主流程 */
  }
}

export async function syncGobricksShortageForSubjectAction(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
}): Promise<
  | {
      ok: true;
      shortageLines: number;
      fulfillmentLines: number;
      message: string;
    }
  | { ok: false; error: string }
> {
  const subjectId = input.subjectId.trim();
  if (!subjectId || subjectId.length > MAX_SUBJECT_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeBuildSubjectId(input.subjectKind, subjectId)) {
    return { ok: false, error: `${subjectKindLabel(input.subjectKind)} ID 含有非法字符。` };
  }

  let bom: { partNum: string; colorId: number; quantity: number }[] = [];

  if (input.subjectKind === BUILD_SUBJECT_MOC) {
    const sheet = await loadBuildPartsSheetFromDb(BUILD_SUBJECT_MOC, subjectId);
    if (!sheet.ok) return { ok: false, error: sheet.error };
    if (!sheet.full?.items.length) {
      return { ok: false, error: "请先上传并保存完整零件表。" };
    }
    bom = sheet.full.items.map((i) => ({
      partNum: i.partNum,
      colorId: i.colorId,
      quantity: i.quantity,
    }));
  } else {
    bom = await loadSetOfficialInventoryBomLines(subjectId);
    if (bom.length === 0) {
      return { ok: false, error: "本地无该套装官方库存，无法对照高砖。" };
    }
  }

  const testList = bomToGobricksTestList(bom);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOBRICKS_TIMEOUT_MS);

  let merged: unknown;
  try {
    merged = await fetchGobricksLego2MergedPayload(testList, { signal: controller.signal });
  } catch (e) {
    const msg =
      controller.signal.aborted
        ? "请求高砖超时。"
        : e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "请求高砖失败，请稍后重试。";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }

  const shortageRows = shortageSerializeRowsFromGobricksPayload(merged);
  const fulfillmentRows = fulfillmentSerializeRowsFromGobricksPayload(merged);

  const shortageResolved = await resolveGobricksSheetSerializedRowsInDb(shortageRows.rows);
  if (!shortageResolved.ok) {
    return { ok: false, error: shortageResolved.error };
  }

  const fulfillmentResolved = await resolveGobricksSheetSerializedRowsInDb(fulfillmentRows.rows);
  if (!fulfillmentResolved.ok) {
    return { ok: false, error: fulfillmentResolved.error };
  }

  const gdsPriceCny = readGdsPriceCnyFromMergedGobricksPayload(merged);
  const shortageLines = shortageResolved.items.length;
  const fulfillmentLines = fulfillmentResolved.items.length;

  if (fulfillmentLines > 0) {
    const fs = await saveBuildPartsSheetToDb({
      subjectKind: input.subjectKind,
      subjectId,
      kind: "fulfillment",
      skippedHeader: fulfillmentResolved.skippedHeader,
      items: fulfillmentResolved.items,
      sourceFileName: "高砖配货表.csv",
    });
    if (!fs.ok) {
      return { ok: false, error: fs.error };
    }
  } else {
    const clr = await clearFulfillmentBranchInDb({
      subjectKind: input.subjectKind,
      subjectId,
    });
    if (!clr.ok && clr.error !== "尚无已保存的零件表记录。") {
      return { ok: false, error: clr.error };
    }
  }

  if (shortageLines > 0) {
    const save = await saveBuildPartsSheetToDb({
      subjectKind: input.subjectKind,
      subjectId,
      kind: "shortage",
      skippedHeader: shortageResolved.skippedHeader,
      items: shortageResolved.items,
      sourceFileName: "高砖缺件查询.csv",
    });
    if (!save.ok) {
      return { ok: false, error: save.error };
    }
    await recordGobricksShortageSyncOk(input.subjectKind, subjectId, gdsPriceCny);
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
      subjectId,
    });
    await recordGobricksShortageSyncOk(input.subjectKind, subjectId, gdsPriceCny);
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

  await recordGobricksShortageSyncOk(input.subjectKind, subjectId, gdsPriceCny);
  return {
    ok: true,
    shortageLines: 0,
    fulfillmentLines,
    message:
      fulfillmentLines > 0
        ? `高砖无缺件；已存缺件表未更改（套装记录无完整表占位时无法自动清空）。已写入 ${fulfillmentLines.toLocaleString("zh-CN")} 条配货。`
        : "高砖无缺件；已存缺件表未更改。未返回可配货行，配货表已清空。",
  };
}
