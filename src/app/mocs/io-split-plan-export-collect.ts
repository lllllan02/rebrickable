import type { IoSplitPlanGroup } from "@/app/mocs/io-batch-parts-sheet-actions";
import {
  fetchIoBatchFulfillmentSheetAction,
  fetchIoBatchModifiedSheetAction,
  fetchIoBatchShortageSheetAction,
  fetchIoPlanMergedModifiedAction,
  fetchIoPlanMergedShortageAction,
} from "@/app/mocs/io-batch-parts-sheet-actions";
import { buildPartsSheetXlsxBuffer, type PartsSheetXlsxRow } from "@/lib/build-parts-sheet-xlsx";
import { buildIoSplitPlanZipBuffer, type IoSplitPlanZipEntry } from "@/lib/build-io-split-plan-zip";
import {
  buildIoPlanMergedModifiedExportStem,
  buildIoPlanMergedShortageExportStem,
  buildIoSplitBatchExportStem,
  FULFILLMENT_MODIFIED_EXPORT_CONTENT_LABEL,
} from "@/lib/parts-sheet-export-filename";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

async function xlsxEntry(stem: string, items: ShortageResolveItem[]): Promise<IoSplitPlanZipEntry> {
  const buffer = await buildPartsSheetXlsxBuffer(items as PartsSheetXlsxRow[]);
  return { filename: `${stem}.xlsx`, buffer };
}

export async function collectAndBuildIoSplitPlanZip(input: {
  mocId: string;
  displayName: string;
  plan: IoSplitPlanGroup;
}): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const { mocId, displayName, plan } = input;
  const planLabel = plan.ruleLabel.trim() || "分包方案";
  const entries: IoSplitPlanZipEntry[] = [];
  const batchIds = plan.batches.map((b) => b.id);

  for (let i = 0; i < plan.batches.length; i++) {
    const batch = plan.batches[i]!;
    const batchLabel = batch.label.trim() || `分包${i + 1}`;
    const base = { mocId, displayName, planLabel, batchLabel };

    const fulfillment = await fetchIoBatchFulfillmentSheetAction(batch.id);
    if (fulfillment.ok && fulfillment.items.length > 0) {
      entries.push(await xlsxEntry(buildIoSplitBatchExportStem(base), fulfillment.items));
    }

    const shortage = await fetchIoBatchShortageSheetAction(batch.id);
    if (shortage.ok && shortage.items.length > 0) {
      entries.push(
        await xlsxEntry(buildIoSplitBatchExportStem({ ...base, sheetSuffix: "缺件表" }), shortage.items)
      );
    }

    const modified = await fetchIoBatchModifiedSheetAction(batch.id);
    if (modified.ok && modified.items.length > 0) {
      entries.push(
        await xlsxEntry(
          buildIoSplitBatchExportStem({
            ...base,
            sheetSuffix: FULFILLMENT_MODIFIED_EXPORT_CONTENT_LABEL,
          }),
          modified.items
        )
      );
    }
  }

  if (batchIds.length > 0) {
    const mergedShortage = await fetchIoPlanMergedShortageAction(batchIds);
    if (mergedShortage.ok && mergedShortage.items.length > 0) {
      entries.push(
        await xlsxEntry(
          buildIoPlanMergedShortageExportStem({ mocId, displayName, planLabel }),
          mergedShortage.items
        )
      );
    }

    const mergedModified = await fetchIoPlanMergedModifiedAction(batchIds);
    if (mergedModified.ok && mergedModified.items.length > 0) {
      entries.push(
        await xlsxEntry(
          buildIoPlanMergedModifiedExportStem({ mocId, displayName, planLabel }),
          mergedModified.items
        )
      );
    }
  }

  if (entries.length === 0) {
    return { ok: false, error: "该方案下尚无可导出的零件表，请先同步高砖数据。" };
  }

  const buffer = await buildIoSplitPlanZipBuffer(entries);
  return { ok: true, buffer };
}
