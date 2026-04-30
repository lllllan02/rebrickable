import "server-only";

import { count, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  colors,
  downloadJobs,
  mocs,
  parts,
  setParts,
  sets,
  settings,
} from "@/db/schema";

import { RebrickableApiError, rebrickableClient } from "./client";

export type ActionResult = {
  ok: boolean;
  message: string;
};

function normalizeSetNum(value: string) {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? `${trimmed}-1` : trimmed;
}

function errorMessage(error: unknown) {
  if (error instanceof RebrickableApiError || error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function createJob(sourceType: "set" | "moc", sourceId: string) {
  return db
    .insert(downloadJobs)
    .values({
      sourceType,
      sourceId,
      status: "running",
      message: "下载中",
    })
    .returning({ id: downloadJobs.id })
    .get();
}

function finishJob(id: number, status: "completed" | "failed", message: string) {
  db.update(downloadJobs)
    .set({ status, message, updatedAt: new Date() })
    .where(eq(downloadJobs.id, id))
    .run();
}

export function saveRebrickableApiKey(apiKey: string): ActionResult {
  const value = apiKey.trim();

  if (!value) {
    return { ok: false, message: "API Key 不能为空。" };
  }

  const now = new Date();

  db.insert(settings)
    .values({
      key: "rebrickable_api_key",
      value,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: now },
    })
    .run();

  return { ok: true, message: "Rebrickable API Key 已保存到本地数据库。" };
}

export async function downloadSetById(rawSetNum: string): Promise<ActionResult> {
  const setNum = normalizeSetNum(rawSetNum);

  if (!setNum) {
    return { ok: false, message: "Set ID 不能为空。" };
  }

  const job = createJob("set", setNum);

  try {
    const [set, inventory, alternates] = await Promise.all([
      rebrickableClient.getSet(setNum),
      rebrickableClient.getSetParts(setNum),
      rebrickableClient.getSetAlternates(setNum),
    ]);

    const now = new Date();

    db.transaction((tx) => {
      tx.insert(sets)
        .values({
          setNum: set.set_num,
          name: set.name,
          year: set.year,
          themeId: set.theme_id,
          numParts: set.num_parts,
          imageUrl: set.set_img_url,
          rebrickableUrl: set.set_url,
          rawJson: JSON.stringify(set),
          downloadedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sets.setNum,
          set: {
            name: set.name,
            year: set.year,
            themeId: set.theme_id,
            numParts: set.num_parts,
            imageUrl: set.set_img_url,
            rebrickableUrl: set.set_url,
            rawJson: JSON.stringify(set),
            downloadedAt: now,
            updatedAt: now,
          },
        })
        .run();

      tx.delete(setParts).where(eq(setParts.setNum, set.set_num)).run();

      for (const item of inventory) {
        tx.insert(parts)
          .values({
            partNum: item.part.part_num,
            name: item.part.name,
            categoryId: item.part.part_cat_id,
            imageUrl: item.part.part_img_url,
            rawJson: JSON.stringify(item.part),
            downloadedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: parts.partNum,
            set: {
              name: item.part.name,
              categoryId: item.part.part_cat_id,
              imageUrl: item.part.part_img_url,
              rawJson: JSON.stringify(item.part),
              downloadedAt: now,
              updatedAt: now,
            },
          })
          .run();

        tx.insert(colors)
          .values({
            id: item.color.id,
            name: item.color.name,
            rgb: item.color.rgb,
            isTransparent: item.color.is_trans ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: colors.id,
            set: {
              name: item.color.name,
              rgb: item.color.rgb,
              isTransparent: item.color.is_trans ?? false,
              updatedAt: now,
            },
          })
          .run();

        tx.insert(setParts)
          .values({
            setNum: set.set_num,
            partNum: item.part.part_num,
            colorId: item.color.id,
            elementId: item.element_id,
            quantity: item.quantity,
            isSpare: item.is_spare,
            rawJson: JSON.stringify(item),
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              setParts.setNum,
              setParts.partNum,
              setParts.colorId,
              setParts.isSpare,
            ],
            set: {
              elementId: item.element_id,
              quantity: item.quantity,
              rawJson: JSON.stringify(item),
              updatedAt: now,
            },
          })
          .run();
      }

      for (const alternate of alternates) {
        tx.insert(mocs)
          .values({
            mocId: alternate.moc_id,
            name: alternate.name,
            designerName: alternate.designer_name,
            numParts: alternate.num_parts,
            imageUrl: alternate.moc_img_url,
            rebrickableUrl: alternate.moc_url,
            rawJson: JSON.stringify(alternate),
            downloadedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: mocs.mocId,
            set: {
              name: alternate.name,
              designerName: alternate.designer_name,
              numParts: alternate.num_parts,
              imageUrl: alternate.moc_img_url,
              rebrickableUrl: alternate.moc_url,
              rawJson: JSON.stringify(alternate),
              downloadedAt: now,
              updatedAt: now,
            },
          })
          .run();
      }
    });

    finishJob(
      job.id,
      "completed",
      `已下载 ${set.name}，包含 ${inventory.length} 条零件记录和 ${alternates.length} 个 Alternate MOC。`,
    );

    return { ok: true, message: "套装数据已下载到本地。" };
  } catch (error) {
    const message = errorMessage(error);
    finishJob(job.id, "failed", message);
    return { ok: false, message };
  }
}

export function downloadMocById(rawMocId: string): ActionResult {
  const mocId = Number(rawMocId.trim().replace(/^MOC-/i, ""));

  if (!Number.isInteger(mocId) || mocId <= 0) {
    return { ok: false, message: "MOC ID 必须是正整数。" };
  }

  const job = createJob("moc", String(mocId));
  const message =
    "Rebrickable API v3 不提供按 MOC ID 下载 MOC 或 MOC 零件清单的官方端点。当前只能通过 Set ID 下载套装及其 Alternate MOC 摘要。";

  finishJob(job.id, "failed", message);

  return { ok: false, message };
}

export function getDashboardData() {
  const [setCount] = db.select({ value: count() }).from(sets).all();
  const [partCount] = db.select({ value: count() }).from(parts).all();
  const [mocCount] = db.select({ value: count() }).from(mocs).all();

  const latestSets = db
    .select()
    .from(sets)
    .orderBy(desc(sets.updatedAt))
    .limit(6)
    .all();

  const latestMocs = db
    .select()
    .from(mocs)
    .orderBy(desc(mocs.updatedAt))
    .limit(6)
    .all();

  const latestJobs = db
    .select()
    .from(downloadJobs)
    .orderBy(desc(downloadJobs.updatedAt))
    .limit(8)
    .all();

  return {
    counts: {
      sets: setCount.value,
      parts: partCount.value,
      mocs: mocCount.value,
    },
    latestSets,
    latestMocs,
    latestJobs,
  };
}
