"use server";

import { and, asc, desc, eq } from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildManualSplitBags,
  buildManualSplitPlans,
  colors,
  inventories,
  inventoryParts,
  partCategories,
  parts,
} from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import {
  BUILD_SUBJECT_SET,
  isBuildSubjectKind,
  isSafeBuildSubjectId,
  type BuildSubjectKind,
} from "@/lib/build-subject";
import { buildSubjectManualSplitPath } from "@/lib/build-subject-paths";
import {
  assertPlanInvariant,
  createEmptyManualSplitState,
  deepCloneSourcePayload,
  parseBagItemsJson,
  parseSourcePayloadJson,
  recomputeRemainder,
  resolveManualSplitSource,
  totalPartQty,
  type ManualSplitBagState,
  type ManualSplitSourceKind,
  type ManualSplitSourcePayload,
} from "@/lib/manual-split";
import { officialInventoryRowsToShortageResolveItems } from "@/lib/official-inventory-to-resolve-items";
import { revalidatePath } from "next/cache";

import { loadBuildPartsSheetFromDb } from "@/app/mocs/moc-parts-sheet-actions";

export type ManualSplitBagListRow = {
  id: number;
  label: string;
  sortOrder: number;
  isRemainder: boolean;
  lineCount: number;
  totalPartQty: number;
};

export type ManualSplitPlanGroup = {
  planId: number;
  name: string;
  sourceKind: ManualSplitSourceKind;
  updatedAt: string;
  bags: ManualSplitBagListRow[];
};

export type ManualSplitPlanLoaded = {
  planId: number;
  subjectKind: BuildSubjectKind;
  subjectId: string;
  name: string;
  sourceKind: ManualSplitSourceKind;
  source: ManualSplitSourcePayload;
  manualBags: ManualSplitBagState[];
  remainder: ManualSplitBagState;
  updatedAt: string;
};

async function loadOfficialInventoryPayload(
  setNum: string
): Promise<ManualSplitSourcePayload | null> {
  const catalogDb = getCatalogDb();
  const [inv] = await catalogDb
    .select({ id: inventories.id, version: inventories.version })
    .from(inventories)
    .where(eq(inventories.setNum, setNum))
    .orderBy(desc(inventories.version), desc(inventories.id))
    .limit(1);
  if (!inv) return null;

  const lines = await catalogDb
    .select({
      partNum: inventoryParts.partNum,
      name: parts.name,
      colorId: inventoryParts.colorId,
      colorName: colors.name,
      quantity: inventoryParts.quantity,
      isSpare: inventoryParts.isSpare,
      imgUrl: inventoryParts.imgUrl,
      partCatName: partCategories.name,
    })
    .from(inventoryParts)
    .innerJoin(parts, eq(inventoryParts.partNum, parts.partNum))
    .innerJoin(colors, eq(inventoryParts.colorId, colors.id))
    .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
    .where(eq(inventoryParts.inventoryId, inv.id));

  if (lines.length === 0) return null;
  return {
    skippedHeader: false,
    items: officialInventoryRowsToShortageResolveItems(
      lines.map((l) => ({
        partNum: l.partNum,
        name: l.name,
        colorId: l.colorId,
        colorName: l.colorName,
        quantity: l.quantity,
        isSpare: l.isSpare,
        imgUrl: l.imgUrl,
        partCatName: l.partCatName ?? null,
      }))
    ),
  };
}

export async function resolveManualSplitSourceForSubject(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string
): Promise<
  | { ok: true; source: NonNullable<ReturnType<typeof resolveManualSplitSource>> }
  | { ok: false; error: string }
> {
  const subjectId = subjectIdRaw.trim();
  if (!isBuildSubjectKind(subjectKind) || !subjectId || !isSafeBuildSubjectId(subjectKind, subjectId)) {
    return { ok: false, error: "无效的主体。" };
  }

  const sheet = await loadBuildPartsSheetFromDb(subjectKind, subjectId);
  const full: ManualSplitSourcePayload | null =
    sheet.ok && sheet.full
      ? { skippedHeader: sheet.full.skippedHeader, items: sheet.full.items }
      : null;

  let official: ManualSplitSourcePayload | null = null;
  if (subjectKind === BUILD_SUBJECT_SET) {
    official = await loadOfficialInventoryPayload(subjectId);
  }

  const source = resolveManualSplitSource({ subjectKind, full, official });
  if (!source) {
    return {
      ok: false,
      error:
        subjectKind === BUILD_SUBJECT_SET
          ? "无可用完整零件表（需上传完整表或本地官方清单）。"
          : "请先上传完整零件表。",
    };
  }
  return { ok: true, source };
}

function revalidateManualSplitPaths(kind: BuildSubjectKind, subjectId: string, planId?: number): void {
  revalidateBuildSubjectPaths(kind, subjectId);
  revalidatePath(buildSubjectManualSplitPath(kind, subjectId));
  if (planId != null && Number.isFinite(planId)) {
    revalidatePath(buildSubjectManualSplitPath(kind, subjectId, planId));
  }
}

export async function listManualSplitPlansForSubject(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string
): Promise<ManualSplitPlanGroup[]> {
  const subjectId = subjectIdRaw.trim();
  if (!isBuildSubjectKind(subjectKind) || !subjectId || !isSafeBuildSubjectId(subjectKind, subjectId)) {
    return [];
  }
  const db = getUserDb();
  const plans = await db
    .select({
      id: buildManualSplitPlans.id,
      name: buildManualSplitPlans.name,
      sourceKind: buildManualSplitPlans.sourceKind,
      updatedAt: buildManualSplitPlans.updatedAt,
    })
    .from(buildManualSplitPlans)
    .where(
      and(
        eq(buildManualSplitPlans.subjectKind, subjectKind),
        eq(buildManualSplitPlans.subjectId, subjectId)
      )
    )
    .orderBy(desc(buildManualSplitPlans.updatedAt), desc(buildManualSplitPlans.id));

  if (plans.length === 0) return [];

  const out: ManualSplitPlanGroup[] = [];
  for (const p of plans) {
    const bags = await db
      .select({
        id: buildManualSplitBags.id,
        label: buildManualSplitBags.label,
        sortOrder: buildManualSplitBags.sortOrder,
        isRemainder: buildManualSplitBags.isRemainder,
        lineCount: buildManualSplitBags.lineCount,
        totalPartQty: buildManualSplitBags.totalPartQty,
      })
      .from(buildManualSplitBags)
      .where(eq(buildManualSplitBags.planId, p.id))
      .orderBy(asc(buildManualSplitBags.sortOrder), asc(buildManualSplitBags.id));

    const sourceKind: ManualSplitSourceKind =
      p.sourceKind === "official" ? "official" : "full";
    out.push({
      planId: p.id,
      name: p.name.trim() || "手动分包",
      sourceKind,
      updatedAt: p.updatedAt,
      bags: bags.map((b) => ({
        id: b.id,
        label: b.label,
        sortOrder: b.sortOrder,
        isRemainder: Boolean(b.isRemainder),
        lineCount: b.lineCount,
        totalPartQty: b.totalPartQty,
      })),
    });
  }
  return out;
}

export async function loadManualSplitPlan(
  planIdRaw: number
): Promise<{ ok: true; plan: ManualSplitPlanLoaded } | { ok: false; error: string }> {
  const planId = Math.trunc(planIdRaw);
  if (!Number.isFinite(planId) || planId < 1) return { ok: false, error: "无效的方案 ID。" };

  const db = getUserDb();
  const [plan] = await db
    .select()
    .from(buildManualSplitPlans)
    .where(eq(buildManualSplitPlans.id, planId))
    .limit(1);
  if (!plan) return { ok: false, error: "未找到该分包方案。" };
  if (!isBuildSubjectKind(plan.subjectKind)) return { ok: false, error: "方案主体无效。" };

  const source = parseSourcePayloadJson(plan.sourcePayloadJson);
  if (!source || source.items.length === 0) {
    return { ok: false, error: "方案源清单损坏。" };
  }

  const bagRows = await db
    .select()
    .from(buildManualSplitBags)
    .where(eq(buildManualSplitBags.planId, planId))
    .orderBy(asc(buildManualSplitBags.sortOrder), asc(buildManualSplitBags.id));

  const manualBags: ManualSplitBagState[] = [];
  let remainder: ManualSplitBagState | null = null;
  let mi = 0;
  for (const b of bagRows) {
    const items = parseBagItemsJson(b.itemsJson);
    const state: ManualSplitBagState = {
      clientKey: b.isRemainder ? "remainder" : `bag-${++mi}`,
      dbId: b.id,
      label: b.label.trim() || (b.isRemainder ? "剩余" : `分包${mi}`),
      isRemainder: Boolean(b.isRemainder),
      items,
    };
    if (state.isRemainder) remainder = state;
    else manualBags.push(state);
  }

  if (!remainder) {
    remainder = {
      clientKey: "remainder",
      label: "剩余",
      isRemainder: true,
      items: recomputeRemainder(source.items, manualBags),
    };
  }
  if (manualBags.length === 0) {
    const empty = createEmptyManualSplitState(source);
    manualBags.push(...empty.manualBags);
  }

  return {
    ok: true,
    plan: {
      planId: plan.id,
      subjectKind: plan.subjectKind,
      subjectId: plan.subjectId,
      name: plan.name.trim() || "手动分包",
      sourceKind: plan.sourceKind === "official" ? "official" : "full",
      source,
      manualBags,
      remainder,
      updatedAt: plan.updatedAt,
    },
  };
}

export async function loadManualSplitBagItems(
  bagIdRaw: number
): Promise<{ ok: true; items: import("@/lib/shortage-resolve-types").ShortageResolveItem[]; label: string; skippedHeader: boolean } | { ok: false; error: string }> {
  const bagId = Math.trunc(bagIdRaw);
  if (!Number.isFinite(bagId) || bagId < 1) return { ok: false, error: "无效的包 ID。" };
  const db = getUserDb();
  const [bag] = await db
    .select({
      itemsJson: buildManualSplitBags.itemsJson,
      label: buildManualSplitBags.label,
      planId: buildManualSplitBags.planId,
    })
    .from(buildManualSplitBags)
    .where(eq(buildManualSplitBags.id, bagId))
    .limit(1);
  if (!bag) return { ok: false, error: "未找到该分包。" };
  const [plan] = await db
    .select({ sourcePayloadJson: buildManualSplitPlans.sourcePayloadJson })
    .from(buildManualSplitPlans)
    .where(eq(buildManualSplitPlans.id, bag.planId))
    .limit(1);
  const source = plan ? parseSourcePayloadJson(plan.sourcePayloadJson) : null;
  return {
    ok: true,
    items: parseBagItemsJson(bag.itemsJson),
    label: bag.label,
    skippedHeader: source?.skippedHeader ?? false,
  };
}

export async function createManualSplitPlan(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  name?: string;
}): Promise<{ ok: true; planId: number } | { ok: false; error: string }> {
  const subjectId = input.subjectId.trim();
  if (
    !isBuildSubjectKind(input.subjectKind) ||
    !subjectId ||
    !isSafeBuildSubjectId(input.subjectKind, subjectId)
  ) {
    return { ok: false, error: "无效的主体。" };
  }

  const resolved = await resolveManualSplitSourceForSubject(input.subjectKind, subjectId);
  if (!resolved.ok) return resolved;

  const source = deepCloneSourcePayload(resolved.source);
  const { manualBags, remainder } = createEmptyManualSplitState(source);
  const now = new Date().toISOString();
  const name = (input.name ?? "").trim() || "手动分包";

  const db = getUserDb();
  const inserted = await db
    .insert(buildManualSplitPlans)
    .values({
      subjectKind: input.subjectKind,
      subjectId,
      name,
      sourceKind: resolved.source.kind,
      sourcePayloadJson: JSON.stringify(source),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: buildManualSplitPlans.id });

  const planId = inserted[0]?.id;
  if (planId == null) return { ok: false, error: "创建方案失败。" };

  const bagValues = [
    ...manualBags.map((b, i) => ({
      planId,
      label: b.label,
      sortOrder: i,
      isRemainder: false as const,
      itemsJson: JSON.stringify(b.items),
      lineCount: b.items.length,
      totalPartQty: totalPartQty(b.items),
      updatedAt: now,
    })),
    {
      planId,
      label: remainder.label,
      sortOrder: manualBags.length,
      isRemainder: true as const,
      itemsJson: JSON.stringify(remainder.items),
      lineCount: remainder.items.length,
      totalPartQty: totalPartQty(remainder.items),
      updatedAt: now,
    },
  ];
  await db.insert(buildManualSplitBags).values(bagValues);

  revalidateManualSplitPaths(input.subjectKind, subjectId, planId);
  return { ok: true, planId };
}

export async function saveManualSplitPlan(input: {
  planId: number;
  name?: string;
  bags: {
    clientKey: string;
    dbId?: number;
    label: string;
    isRemainder: boolean;
    items: import("@/lib/shortage-resolve-types").ShortageResolveItem[];
  }[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const planId = Math.trunc(input.planId);
  if (!Number.isFinite(planId) || planId < 1) return { ok: false, error: "无效的方案 ID。" };

  const db = getUserDb();
  const [plan] = await db
    .select()
    .from(buildManualSplitPlans)
    .where(eq(buildManualSplitPlans.id, planId))
    .limit(1);
  if (!plan) return { ok: false, error: "未找到该分包方案。" };
  if (!isBuildSubjectKind(plan.subjectKind)) return { ok: false, error: "方案主体无效。" };

  const source = parseSourcePayloadJson(plan.sourcePayloadJson);
  if (!source) return { ok: false, error: "方案源清单损坏。" };

  const manuals = input.bags.filter((b) => !b.isRemainder);
  const remainderItems = recomputeRemainder(
    source.items,
    manuals.map((b) => ({ items: b.items }))
  );
  const bagsForCheck = [
    ...manuals.map((b) => ({ isRemainder: false, items: b.items })),
    { isRemainder: true, items: remainderItems },
  ];
  const inv = assertPlanInvariant(source.items, bagsForCheck);
  if (!inv.ok) return inv;

  const now = new Date().toISOString();
  const name = (input.name ?? plan.name).trim() || "手动分包";

  await db
    .update(buildManualSplitPlans)
    .set({ name, updatedAt: now })
    .where(eq(buildManualSplitPlans.id, planId));

  await db.delete(buildManualSplitBags).where(eq(buildManualSplitBags.planId, planId));

  const bagValues = [
    ...manuals.map((b, i) => ({
      planId,
      label: b.label.trim() || `分包${i + 1}`,
      sortOrder: i,
      isRemainder: false as const,
      itemsJson: JSON.stringify(b.items),
      lineCount: b.items.length,
      totalPartQty: totalPartQty(b.items),
      updatedAt: now,
    })),
    {
      planId,
      label: "剩余",
      sortOrder: manuals.length,
      isRemainder: true as const,
      itemsJson: JSON.stringify(remainderItems),
      lineCount: remainderItems.length,
      totalPartQty: totalPartQty(remainderItems),
      updatedAt: now,
    },
  ];
  await db.insert(buildManualSplitBags).values(bagValues);

  revalidateManualSplitPaths(plan.subjectKind, plan.subjectId, planId);
  return { ok: true };
}

export async function deleteManualSplitPlan(input: {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  planId: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const subjectId = input.subjectId.trim();
  const planId = Math.trunc(input.planId);
  if (
    !isBuildSubjectKind(input.subjectKind) ||
    !subjectId ||
    !isSafeBuildSubjectId(input.subjectKind, subjectId) ||
    !Number.isFinite(planId) ||
    planId < 1
  ) {
    return { ok: false, error: "无效参数。" };
  }

  const db = getUserDb();
  const [plan] = await db
    .select({
      id: buildManualSplitPlans.id,
      subjectKind: buildManualSplitPlans.subjectKind,
      subjectId: buildManualSplitPlans.subjectId,
    })
    .from(buildManualSplitPlans)
    .where(eq(buildManualSplitPlans.id, planId))
    .limit(1);

  if (
    !plan ||
    plan.subjectKind !== input.subjectKind ||
    plan.subjectId !== subjectId
  ) {
    return { ok: false, error: "未找到该分包方案或已被删除。" };
  }

  await db.delete(buildManualSplitBags).where(eq(buildManualSplitBags.planId, planId));
  await db.delete(buildManualSplitPlans).where(eq(buildManualSplitPlans.id, planId));

  revalidateManualSplitPaths(input.subjectKind, subjectId);
  return { ok: true };
}
