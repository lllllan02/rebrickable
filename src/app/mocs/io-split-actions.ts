"use server";

import { and, eq } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

import {
  deleteIoBatchesByIds,
  deleteIoStepBatchesForMoc,
  listIoSplitPlanGroupsForMoc,
} from "@/app/mocs/io-batch-parts-sheet-actions";
import { getUserDb } from "@/db/client";
import { buildAttachments, buildIoStepBatches } from "@/db/schema";
import { revalidateMocIoSplitPaths } from "@/lib/build-revalidate-paths";
import { BUILD_SUBJECT_MOC, isSafeBuildSubjectId } from "@/lib/build-subject";
import { dualSheetsToPayloadV2 } from "@/lib/parts-sheet-moc-id";
import type { StudioIoMainStep } from "@/lib/parse-studio-io";
import { readStudioIoFromAbsolutePath } from "@/lib/read-studio-io-from-path";
import { resolveStudioIoPlacementsInDb } from "@/lib/resolve-studio-io-placements-in-db";
import {
  splitResolvedItemsByCategory,
  splitStudioIoByConfig,
  type IoSplitConfig,
} from "@/lib/studio-io-split";
import { buildUploadAbsoluteDir } from "@/lib/build-upload-storage";
import { applyGobricksSyncForIoBatch } from "@/lib/gobricks-sync-io-batch";
import {
  ioSplitPackageLabel,
  normalizeIoSplitBatchLabels,
} from "@/lib/io-split-labels";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type IoSplitPreviewStep = {
  stepIndex: number;
  title: string;
  description: string | null;
  newPlacementCount: number;
};

export type IoSplitPreviewBatch = {
  label: string;
  stepFrom: number;
  stepTo: number;
  stepIndexes: number[];
  lineCount: number;
  totalPartQty: number;
  unresolvedSubmodelCount: number;
};

export type IoSplitPreviewResult =
  | {
      ok: true;
      modelName: string;
      studioVersion: string | null;
      steps: IoSplitPreviewStep[];
      batches: IoSplitPreviewBatch[];
    }
  | { ok: false; error: string };

function countUnresolved(items: ShortageResolveItem[]): number {
  return items.filter((r) => r.rest.includes("子组件") || !r.partFound).length;
}

async function resolveDraftPlacements(
  placements: { partNum: string; ldrawColorId: number; isSubmodelRef: boolean; submodelName?: string }[]
): Promise<{ ok: true; items: ShortageResolveItem[] } | { ok: false; error: string }> {
  const r = await resolveStudioIoPlacementsInDb(placements);
  if (!r.ok) return r;
  return { ok: true, items: r.items };
}

async function batchesFromConfig(
  parsed: Awaited<ReturnType<typeof readStudioIoFromAbsolutePath>>,
  config: IoSplitConfig
): Promise<
  | {
      ok: true;
      batches: {
        label: string;
        stepFrom: number;
        stepTo: number;
        stepIndexes: number[];
        items: ShortageResolveItem[];
      }[];
    }
  | { ok: false; error: string }
> {
  if (config.mode === "by_category") {
    const allPlacements = parsed.mainSteps.flatMap((s) => s.newPlacements);
    const resolved = await resolveDraftPlacements(allPlacements);
    if (!resolved.ok) return resolved;
    const groups = splitResolvedItemsByCategory(resolved.items, parsed);
    return {
      ok: true,
      batches: normalizeIoSplitBatchLabels(
        groups.map((g) => ({
          label: g.label,
          stepFrom: g.stepFrom,
          stepTo: g.stepTo,
          stepIndexes: g.stepIndexes,
          items: g.items,
        }))
      ),
    };
  }

  if (config.mode === "by_color") {
    const allPlacements = parsed.mainSteps.flatMap((s) => s.newPlacements);
    const resolved = await resolveDraftPlacements(allPlacements);
    if (!resolved.ok) return resolved;
    const byColor = new Map<number, ShortageResolveItem[]>();
    for (const row of resolved.items) {
      const list = byColor.get(row.colorId) ?? [];
      list.push(row);
      byColor.set(row.colorId, list);
    }
    const lastStep = parsed.mainSteps[parsed.mainSteps.length - 1]?.stepIndex ?? 0;
    const allIndexes = parsed.mainSteps.map((s) => s.stepIndex);
    return {
      ok: true,
      batches: normalizeIoSplitBatchLabels(
        [...byColor.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([colorId, items]) => ({
            label: items[0]?.colorName?.trim() ? `${items[0].colorName} (${colorId})` : `颜色 ${colorId}`,
            stepFrom: 0,
            stepTo: lastStep,
            stepIndexes: allIndexes,
            items,
          }))
      ),
    };
  }

  const drafts = splitStudioIoByConfig(parsed, config);
  const batches: {
    label: string;
    stepFrom: number;
    stepTo: number;
    stepIndexes: number[];
    items: ShortageResolveItem[];
  }[] = [];

  for (const d of drafts) {
    const resolved = await resolveDraftPlacements(d.placements);
    if (!resolved.ok) return resolved;
    batches.push({
      label: d.label,
      stepFrom: d.stepFrom,
      stepTo: d.stepTo,
      stepIndexes: d.stepIndexes,
      items: resolved.items,
    });
  }
  return { ok: true, batches: normalizeIoSplitBatchLabels(batches) };
}

function resolveIoSplitPlanRuleLabel(
  plans: Awaited<ReturnType<typeof listIoSplitPlanGroupsForMoc>>,
  attachmentId: number,
  configJson: string,
  replaceExisting: boolean
): string {
  if (replaceExisting) {
    const existing = plans.find(
      (p) => p.attachmentId === attachmentId && p.splitConfigJson === configJson
    );
    const kept = existing?.ruleLabel.trim();
    if (kept) return kept;
  }
  return ioSplitPackageLabel(plans.length + 1);
}

async function loadIoAbsolutePath(
  mocId: string,
  attachmentId: number
): Promise<{ ok: true; absPath: string } | { ok: false; error: string }> {
  const db = getUserDb();
  const rows = await db
    .select()
    .from(buildAttachments)
    .where(
      and(
        eq(buildAttachments.id, attachmentId),
        eq(buildAttachments.subjectKind, BUILD_SUBJECT_MOC),
        eq(buildAttachments.subjectId, mocId)
      )
    )
    .limit(1);
  const att = rows[0];
  if (!att) return { ok: false, error: "附件不存在。" };
  const absPath = path.join(
    buildUploadAbsoluteDir(BUILD_SUBJECT_MOC, mocId),
    att.storedFile
  );
  try {
    await fs.access(absPath);
  } catch {
    return { ok: false, error: "附件文件缺失。" };
  }
  return { ok: true, absPath };
}

export async function previewIoStepSplitAction(input: {
  mocId: string;
  attachmentId: number;
  config: IoSplitConfig;
}): Promise<IoSplitPreviewResult> {
  const mocId = input.mocId.trim();
  if (!mocId || !isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  const pathResult = await loadIoAbsolutePath(mocId, input.attachmentId);
  if (!pathResult.ok) return pathResult;

  let parsed;
  try {
    parsed = await readStudioIoFromAbsolutePath(pathResult.absPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "解析 .io 失败。";
    return { ok: false, error: msg };
  }

  const built = await batchesFromConfig(parsed, input.config);
  if (!built.ok) return built;

  return {
    ok: true,
    modelName: parsed.modelName,
    studioVersion: parsed.studioVersion,
    steps: parsed.mainSteps.map((s: StudioIoMainStep) => ({
      stepIndex: s.stepIndex,
      title: s.title,
      description: s.description,
      newPlacementCount: s.newPlacements.length,
    })),
    batches: built.batches.map((b) => ({
      label: b.label,
      stepFrom: b.stepFrom,
      stepTo: b.stepTo,
      stepIndexes: b.stepIndexes,
      lineCount: b.items.length,
      totalPartQty: b.items.reduce((n, r) => n + r.quantity, 0),
      unresolvedSubmodelCount: countUnresolved(b.items),
    })),
  };
}

export async function commitIoStepSplitAction(input: {
  mocId: string;
  attachmentId: number;
  config: IoSplitConfig;
  ruleLabel?: string;
  replaceExisting: boolean;
}): Promise<
  | { ok: true; batchIds: number[]; count: number; gobricksMessage: string }
  | { ok: false; error: string }
> {
  const mocId = input.mocId.trim();
  if (!mocId || !isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return { ok: false, error: "MOC ID 无效。" };
  }

  const preview = await previewIoStepSplitAction({
    mocId,
    attachmentId: input.attachmentId,
    config: input.config,
  });
  if (!preview.ok) return preview;
  if (preview.batches.length === 0) {
    return { ok: false, error: "没有可保存的批次。" };
  }

  const pathResult = await loadIoAbsolutePath(mocId, input.attachmentId);
  if (!pathResult.ok) return pathResult;

  const built = await batchesFromConfig(
    await readStudioIoFromAbsolutePath(pathResult.absPath),
    input.config
  );
  if (!built.ok) return built;

  const savedAt = new Date().toISOString();
  const configJson = JSON.stringify(input.config);
  const plans = await listIoSplitPlanGroupsForMoc(mocId);
  const ruleLabel =
    input.ruleLabel?.trim() ||
    resolveIoSplitPlanRuleLabel(plans, input.attachmentId, configJson, input.replaceExisting);
  const db = getUserDb();

  try {
    const batchIds: number[] = [];
    db.transaction((tx) => {
      if (input.replaceExisting) {
        tx.delete(buildIoStepBatches)
          .where(
            and(
              eq(buildIoStepBatches.subjectKind, BUILD_SUBJECT_MOC),
              eq(buildIoStepBatches.subjectId, mocId),
              eq(buildIoStepBatches.attachmentId, input.attachmentId),
              eq(buildIoStepBatches.ruleLabel, ruleLabel),
              eq(buildIoStepBatches.splitConfigJson, configJson)
            )
          )
          .run();
      }
      let sortOrder = 0;
      for (const b of built.batches) {
        const dual = {
          full: {
            skippedHeader: true,
            items: b.items,
            savedAt,
          },
          shortage: null,
          fulfillment: null,
        };
        const payload = dualSheetsToPayloadV2(dual);
        const lineCount = b.items.length;
        const totalPartQty = b.items.reduce((n, r) => n + r.quantity, 0);
        const r = tx
          .insert(buildIoStepBatches)
          .values({
            subjectKind: BUILD_SUBJECT_MOC,
            subjectId: mocId,
            attachmentId: input.attachmentId,
            ruleLabel,
            label: b.label,
            sortOrder,
            splitMode: input.config.mode,
            splitConfigJson: configJson,
            mainStepFrom: b.stepFrom,
            mainStepTo: b.stepTo,
            mainStepIndexesJson: JSON.stringify(b.stepIndexes),
            skippedHeader: true,
            payloadJson: JSON.stringify(payload),
            lineCount,
            totalPartQty,
            updatedAt: savedAt,
            firstSavedAt: savedAt,
            shortageLineCount: null,
            shortageTotalQty: null,
            shortageStatsOk: false,
            shortageClearedAt: null,
            gobricksShortageSyncAt: null,
            gobricksGdsPriceCny: null,
          })
          .run();
        const id = Number(r.lastInsertRowid);
        if (id > 0) batchIds.push(id);
        sortOrder += 1;
      }
    });

    const gobricksNotes: string[] = [];
    for (const id of batchIds) {
      const sync = await applyGobricksSyncForIoBatch(id, { confirmOverwriteModified: true });
      if (!sync.ok) {
        await deleteIoBatchesByIds(batchIds);
        revalidateMocIoSplitPaths(mocId);
        return {
          ok: false,
          error: `高砖同步失败（${"error" in sync ? sync.error : sync.message}），分包未保存。`,
        };
      }
      gobricksNotes.push(sync.message);
    }

    revalidateMocIoSplitPaths(mocId);
    const gobricksMessage =
      gobricksNotes.length === 1
        ? gobricksNotes[0]!
        : `已为 ${batchIds.length} 个分包写入高砖可购零件与缺件对照。`;
    return { ok: true, batchIds, count: batchIds.length, gobricksMessage };
  } catch {
    return { ok: false, error: "写入数据库失败。" };
  }
}

export async function loadIoSplitContextAction(input: {
  mocId: string;
  attachmentId: number;
}): Promise<
  | {
      ok: true;
      modelName: string;
      studioVersion: string | null;
      steps: IoSplitPreviewStep[];
      existingBatchCount: number;
    }
  | { ok: false; error: string }
> {
  const mocId = input.mocId.trim();
  if (!mocId || !isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  const pathResult = await loadIoAbsolutePath(mocId, input.attachmentId);
  if (!pathResult.ok) return pathResult;

  let parsed;
  try {
    parsed = await readStudioIoFromAbsolutePath(pathResult.absPath);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "解析失败。" };
  }

  const db = getUserDb();
  const existing = await db
    .select({ id: buildIoStepBatches.id })
    .from(buildIoStepBatches)
    .where(
      and(
        eq(buildIoStepBatches.subjectKind, BUILD_SUBJECT_MOC),
        eq(buildIoStepBatches.subjectId, mocId),
        eq(buildIoStepBatches.attachmentId, input.attachmentId)
      )
    );

  return {
    ok: true,
    modelName: parsed.modelName,
    studioVersion: parsed.studioVersion,
    steps: parsed.mainSteps.map((s) => ({
      stepIndex: s.stepIndex,
      title: s.title,
      description: s.description,
      newPlacementCount: s.newPlacements.length,
    })),
    existingBatchCount: existing.length,
  };
}

export { deleteIoStepBatchesForMoc };
