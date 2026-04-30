import "server-only";

import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

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
import type {
  RebrickableAlternate,
  RebrickableInventoryPart,
  RebrickableSet,
} from "./types";

export type ActionResult = {
  ok: boolean;
  message: string;
};

type DownloadJobStatus = "completed" | "failed" | "cancelled";

type DownloadProgress = {
  stage: string;
  current?: number | null;
  total?: number | null;
  detail?: string | null;
  message?: string;
};

const activeDownloads = new Map<string, { controller: AbortController; jobId: number }>();

class DownloadCancelledError extends Error {
  constructor() {
    super("下载已取消。");
    this.name = "DownloadCancelledError";
  }
}

function normalizeSetNum(value: string) {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? `${trimmed}-1` : trimmed;
}

function errorMessage(error: unknown) {
  if (error instanceof DownloadCancelledError) {
    return error.message;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "下载已取消。";
  }

  if (error instanceof RebrickableApiError || error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function isCancellation(error: unknown) {
  return (
    error instanceof DownloadCancelledError ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

function targetKey(sourceType: "set" | "moc", sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DownloadCancelledError();
  }
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const imageFileExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];

function imageExtensionFromUrl(url: string) {
  return new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|svg)$/i)?.[0]?.toLowerCase();
}

function imageExtension(url: string, contentType: string | null) {
  if (contentType?.includes("png")) {
    return ".png";
  }

  if (contentType?.includes("webp")) {
    return ".webp";
  }

  if (contentType?.includes("gif")) {
    return ".gif";
  }

  if (contentType?.includes("svg")) {
    return ".svg";
  }

  return imageExtensionFromUrl(url) ?? ".jpg";
}

function isNotFoundError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function findExistingImageFile(assetDirectory: string, safeFileNameBase: string) {
  const { readdir } = await import("node:fs/promises");

  try {
    const fileNames = await readdir(assetDirectory);
    const lowerBase = safeFileNameBase.toLowerCase();

    return (
      fileNames.find((fileName) => {
        const lowerFileName = fileName.toLowerCase();
        return imageFileExtensions.some((extension) => lowerFileName === `${lowerBase}${extension}`);
      }) ?? null
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function downloadImage(
  url: string | null | undefined,
  pathSegments: string[],
  fileName: string,
  signal: AbortSignal,
) {
  if (!url) {
    return null;
  }

  const safeSegments = pathSegments.map(sanitizePathSegment);
  const safeFileNameBase = sanitizePathSegment(fileName);
  const [{ mkdir, writeFile }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const assetDirectory = join(
    process.cwd(),
    "public",
    "rebrickable-assets",
    ...safeSegments,
  );

  throwIfCancelled(signal);
  const existingFileName = await findExistingImageFile(assetDirectory, safeFileNameBase);

  if (existingFileName) {
    return ["", "rebrickable-assets", ...safeSegments, existingFileName].join("/");
  }

  const response = await fetch(url, { cache: "no-store", signal });

  if (!response.ok) {
    throw new RebrickableApiError(`图片下载失败：${response.status} ${url}`, response.status);
  }

  const extension = imageExtension(url, response.headers.get("content-type"));
  const safeFileName = `${safeFileNameBase}${extension}`;

  throwIfCancelled(signal);
  await mkdir(assetDirectory, { recursive: true });
  await writeFile(join(assetDirectory, safeFileName), Buffer.from(await response.arrayBuffer()));

  return ["", "rebrickable-assets", ...safeSegments, safeFileName].join("/");
}

async function writeSetInventoryFiles(
  set: RebrickableSet,
  inventory: Array<{ item: RebrickableInventoryPart; imageUrl: string | null }>,
) {
  const [{ mkdir, writeFile }, { join }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const setDirectory = join(
    process.cwd(),
    "public",
    "rebrickable-assets",
    "sets",
    sanitizePathSegment(set.set_num),
  );
  const rows = inventory.map(({ item, imageUrl }) => ({
    set_num: set.set_num,
    part_num: item.part.part_num,
    part_name: item.part.name,
    color_id: item.color.id,
    color_name: item.color.name,
    color_rgb: item.color.rgb ?? null,
    quantity: item.quantity,
    is_spare: item.is_spare,
    element_id: item.element_id ?? null,
    part_img_url: imageUrl,
  }));
  const csvHeader = [
    "set_num",
    "part_num",
    "part_name",
    "color_id",
    "color_name",
    "color_rgb",
    "quantity",
    "is_spare",
    "element_id",
    "part_img_url",
  ];
  const csvRows = rows.map((row) =>
    [
      row.set_num,
      row.part_num,
      row.part_name,
      row.color_id,
      row.color_name,
      row.color_rgb,
      row.quantity,
      row.is_spare,
      row.element_id,
      row.part_img_url,
    ]
      .map(csvValue)
      .join(","),
  );

  await mkdir(setDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(setDirectory, "inventory.json"), JSON.stringify(rows, null, 2)),
    writeFile(join(setDirectory, "inventory.csv"), [csvHeader.join(","), ...csvRows].join("\n")),
  ]);
}

function createJob(sourceType: "set" | "moc", sourceId: string) {
  return db
    .insert(downloadJobs)
    .values({
      sourceType,
      sourceId,
      status: "running",
      message: "准备下载",
      progressStage: "准备",
      progressCurrent: 0,
      progressDetail: `等待开始 ${sourceType.toUpperCase()} ${sourceId}`,
    })
    .returning({ id: downloadJobs.id })
    .get();
}

function getActiveDownloadJob(sourceType: "set" | "moc", sourceId: string) {
  return db
    .select({ id: downloadJobs.id })
    .from(downloadJobs)
    .where(
      and(
        eq(downloadJobs.sourceType, sourceType),
        eq(downloadJobs.sourceId, sourceId),
        inArray(downloadJobs.status, ["pending", "running"]),
      ),
    )
    .orderBy(desc(downloadJobs.updatedAt))
    .limit(1)
    .get();
}

function progressMessage({ current, detail, message, stage, total }: DownloadProgress) {
  if (message) {
    return message;
  }

  const hasCount = typeof current === "number" || typeof total === "number";
  const countText = hasCount ? `（${current ?? 0}/${total ?? "?"}）` : "";

  return [stage + countText, detail].filter(Boolean).join("：");
}

function updateJobProgress(id: number, progress: DownloadProgress) {
  db.update(downloadJobs)
    .set({
      message: progressMessage(progress),
      progressStage: progress.stage,
      progressCurrent: progress.current,
      progressTotal: progress.total,
      progressDetail: progress.detail,
      updatedAt: new Date(),
    })
    .where(eq(downloadJobs.id, id))
    .run();
}

function finishJob(
  id: number,
  status: DownloadJobStatus,
  message: string,
  progress?: Partial<DownloadProgress>,
) {
  db.update(downloadJobs)
    .set({
      status,
      message,
      progressStage:
        progress?.stage ??
        (status === "completed" ? "完成" : status === "cancelled" ? "已取消" : "失败"),
      progressCurrent: progress?.current,
      progressTotal: progress?.total,
      progressDetail: progress?.detail,
      updatedAt: new Date(),
    })
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

export function getApiKeySettings() {
  const apiKeyFromEnv = process.env.REBRICKABLE_API_KEY?.trim();
  const apiKeyFromDb = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "rebrickable_api_key"))
    .get();
  const apiKeyFromDatabase = apiKeyFromDb?.value.trim();
  const value = apiKeyFromEnv || apiKeyFromDatabase || "";

  return {
    isConfigured: Boolean(value),
    source: apiKeyFromEnv ? "env" : apiKeyFromDatabase ? "database" : null,
    value,
  };
}

async function runSetDownload(
  jobId: number,
  setNum: string,
  signal: AbortSignal,
): Promise<ActionResult> {
  updateJobProgress(jobId, {
    stage: "获取 API 数据",
    current: 0,
    detail: `正在读取 ${setNum} 的套装、零件清单和 Alternate MOC`,
  });

  try {
    throwIfCancelled(signal);
    const [set, inventory, alternates] = await Promise.all([
      rebrickableClient.getSet(setNum, signal),
      rebrickableClient.getSetParts(setNum, signal),
      rebrickableClient.getSetAlternates(setNum, signal),
    ]);
    const totalImages = 1 + inventory.length + alternates.length;
    let processedImages = 0;

    updateJobProgress(jobId, {
      stage: "处理图片",
      current: processedImages,
      total: totalImages,
      detail: `准备处理 1 张套装图、${inventory.length} 张零件图、${alternates.length} 张 Alternate MOC 图`,
    });

    const setImageUrl =
      (await downloadImage(set.set_img_url, ["sets", set.set_num], "set", signal)) ??
      set.set_img_url;

    processedImages += 1;
    updateJobProgress(jobId, {
      stage: "处理图片",
      current: processedImages,
      total: totalImages,
      detail: `已处理套装图：${set.name}`,
    });

    const inventoryWithImages: Array<{
      item: RebrickableInventoryPart;
      imageUrl: string | null;
    }> = [];

    for (const item of inventory) {
      throwIfCancelled(signal);
      const localImageUrl =
        (await downloadImage(
          item.part.part_img_url,
          ["sets", set.set_num, "parts", item.part.part_num],
          "part",
          signal,
        )) ??
        item.part.part_img_url ??
        null;

      processedImages += 1;
      inventoryWithImages.push({ item, imageUrl: localImageUrl });
      updateJobProgress(jobId, {
        stage: "处理图片",
        current: processedImages,
        total: totalImages,
        detail: `零件 ${item.part.part_num}：${item.part.name}`,
      });
    }

    const alternatesWithImages: Array<{
      alternate: RebrickableAlternate;
      imageUrl: string | null;
    }> = [];

    for (const alternate of alternates) {
      throwIfCancelled(signal);
      const localImageUrl =
        (await downloadImage(
          alternate.moc_img_url,
          ["sets", set.set_num, "mocs", String(alternate.moc_id)],
          "moc",
          signal,
        )) ??
        alternate.moc_img_url ??
        null;

      processedImages += 1;
      alternatesWithImages.push({ alternate, imageUrl: localImageUrl });
      updateJobProgress(jobId, {
        stage: "处理图片",
        current: processedImages,
        total: totalImages,
        detail: `Alternate MOC-${alternate.moc_id}：${alternate.name}`,
      });
    }

    updateJobProgress(jobId, {
      stage: "写入文件",
      current: processedImages,
      total: totalImages,
      detail: `正在保存 ${inventory.length} 条零件清单 JSON/CSV`,
    });

    throwIfCancelled(signal);
    await writeSetInventoryFiles(set, inventoryWithImages);

    updateJobProgress(jobId, {
      stage: "写入数据库",
      current: processedImages,
      total: totalImages,
      detail: `正在写入套装、${inventory.length} 条零件记录和 ${alternates.length} 个 Alternate MOC`,
    });

    throwIfCancelled(signal);
    const now = new Date();

    db.transaction((tx) => {
      tx.insert(sets)
        .values({
          setNum: set.set_num,
          name: set.name,
          year: set.year,
          themeId: set.theme_id,
          numParts: set.num_parts,
          imageUrl: setImageUrl,
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
            imageUrl: setImageUrl,
            rebrickableUrl: set.set_url,
            rawJson: JSON.stringify(set),
            downloadedAt: now,
            updatedAt: now,
          },
        })
        .run();

      tx.delete(setParts).where(eq(setParts.setNum, set.set_num)).run();

      for (const { item, imageUrl } of inventoryWithImages) {
        tx.insert(parts)
          .values({
            partNum: item.part.part_num,
            name: item.part.name,
            categoryId: item.part.part_cat_id,
            imageUrl,
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
              imageUrl,
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

      for (const { alternate, imageUrl } of alternatesWithImages) {
        tx.insert(mocs)
          .values({
            mocId: alternate.moc_id,
            name: alternate.name,
            designerName: alternate.designer_name,
            numParts: alternate.num_parts,
            imageUrl,
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
              imageUrl,
              rebrickableUrl: alternate.moc_url,
              rawJson: JSON.stringify(alternate),
              downloadedAt: now,
              updatedAt: now,
            },
          })
          .run();
      }
    });

    throwIfCancelled(signal);
    finishJob(
      jobId,
      "completed",
      `已下载 ${set.name}，包含 ${inventory.length} 条零件记录和 ${alternates.length} 个 Alternate MOC；下载内容已保存到 public/rebrickable-assets/sets/${set.set_num}/。`,
      {
        stage: "完成",
        current: totalImages,
        total: totalImages,
        detail: `${inventory.length} 条零件记录，${alternates.length} 个 Alternate MOC`,
      },
    );

    return { ok: true, message: "套装数据已下载到本地。" };
  } catch (error) {
    const message = errorMessage(error);
    const cancelled = isCancellation(error);
    finishJob(jobId, cancelled ? "cancelled" : "failed", message, {
      stage: cancelled ? "已取消" : "失败",
      detail: message,
    });
    return { ok: false, message };
  }
}

export function startDownloadSetById(rawSetNum: string): ActionResult {
  const setNum = normalizeSetNum(rawSetNum);

  if (!setNum) {
    return { ok: false, message: "Set ID 不能为空。" };
  }

  const key = targetKey("set", setNum);
  const activeJob = activeDownloads.get(key);
  const existingJobId = activeJob?.jobId ?? getActiveDownloadJob("set", setNum)?.id;

  if (existingJobId) {
    return {
      ok: false,
      message: `Set ${setNum} 已有下载任务正在运行，请等待完成或先取消任务 #${existingJobId}。`,
    };
  }

  const controller = new AbortController();
  const job = createJob("set", setNum);
  activeDownloads.set(key, { controller, jobId: job.id });

  void runSetDownload(job.id, setNum, controller.signal).finally(() => {
    const activeJob = activeDownloads.get(key);

    if (activeJob?.jobId === job.id) {
      activeDownloads.delete(key);
    }
  });

  return { ok: true, message: `Set ${setNum} 下载任务已启动。` };
}

export async function downloadSetById(rawSetNum: string): Promise<ActionResult> {
  const setNum = normalizeSetNum(rawSetNum);

  if (!setNum) {
    return { ok: false, message: "Set ID 不能为空。" };
  }

  const controller = new AbortController();
  const job = createJob("set", setNum);
  return runSetDownload(job.id, setNum, controller.signal);
}

export function downloadMocById(rawMocId: string): ActionResult {
  const mocId = Number(rawMocId.trim().replace(/^MOC-/i, ""));

  if (!Number.isInteger(mocId) || mocId <= 0) {
    return { ok: false, message: "MOC ID 必须是正整数。" };
  }

  const job = createJob("moc", String(mocId));
  const message =
    "Rebrickable API v3 不提供按 MOC ID 下载 MOC 或 MOC 零件清单的官方端点。当前只能通过 Set ID 下载套装及其 Alternate MOC 摘要。";

  finishJob(job.id, "failed", message, {
    stage: "无法下载",
    current: 0,
    total: 0,
    detail: "Rebrickable API v3 没有对应官方端点",
  });

  return { ok: false, message };
}

export function cancelDownloadJob(jobId: number): ActionResult {
  const job = db
    .select()
    .from(downloadJobs)
    .where(eq(downloadJobs.id, jobId))
    .get();

  if (!job) {
    return { ok: false, message: "下载任务不存在。" };
  }

  if (job.status !== "pending" && job.status !== "running") {
    return { ok: false, message: "该下载任务已结束，无法取消。" };
  }

  activeDownloads.get(targetKey(job.sourceType, job.sourceId))?.controller.abort();
  finishJob(job.id, "cancelled", "下载已取消。", {
    stage: "已取消",
    current: job.progressCurrent,
    total: job.progressTotal,
    detail: "用户取消了下载任务",
  });

  return { ok: true, message: "已取消下载任务。" };
}

export function getLatestDownloadJobs(limit = 8) {
  return db
    .select()
    .from(downloadJobs)
    .orderBy(desc(downloadJobs.updatedAt))
    .limit(limit)
    .all();
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

  const latestJobs = getLatestDownloadJobs();

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

export function getSetListData() {
  const [setCount] = db.select({ value: count() }).from(sets).all();
  const allSets = db
    .select()
    .from(sets)
    .orderBy(desc(sets.updatedAt))
    .all();

  return {
    count: setCount.value,
    sets: allSets,
  };
}

export function getSetDetailData(setNum: string) {
  const set = db.select().from(sets).where(eq(sets.setNum, setNum)).get();

  if (!set) {
    return null;
  }

  const inventory = db
    .select({
      partNum: setParts.partNum,
      partName: parts.name,
      colorName: colors.name,
      colorRgb: colors.rgb,
      elementId: setParts.elementId,
      quantity: setParts.quantity,
      isSpare: setParts.isSpare,
      imageUrl: parts.imageUrl,
    })
    .from(setParts)
    .innerJoin(parts, eq(setParts.partNum, parts.partNum))
    .innerJoin(colors, eq(setParts.colorId, colors.id))
    .where(eq(setParts.setNum, setNum))
    .orderBy(asc(setParts.isSpare), desc(setParts.quantity), asc(parts.name))
    .all();

  const latestJob = db
    .select()
    .from(downloadJobs)
    .where(eq(downloadJobs.sourceId, setNum))
    .orderBy(desc(downloadJobs.updatedAt))
    .limit(1)
    .get();

  return {
    set,
    inventory,
    latestJob,
  };
}
