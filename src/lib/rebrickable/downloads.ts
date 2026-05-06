import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db/client";
import {
  colors,
  downloadJobs,
  mocs,
  partColorOptions,
  parts,
  setParts,
  sets,
  settings,
} from "@/db/schema";

import { RebrickableApiError, rebrickableClient } from "./client";
import type {
  RebrickableAlternate,
  RebrickableInventoryPart,
  RebrickablePartColor,
  RebrickableSet,
} from "./types";

export type ActionResult = {
  ok: boolean;
  message: string;
};

type DownloadJobStatus = "completed" | "failed" | "cancelled";
type DownloadSourceType = "set" | "moc" | "catalog";

type DownloadProgress = {
  stage: string;
  current?: number | null;
  total?: number | null;
  detail?: string | null;
  message?: string;
};

export type PartExplorerFilters = {
  query?: string;
  categoryId?: number;
  colorId?: number;
  page?: number;
  pageSize?: number;
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

function targetKey(sourceType: DownloadSourceType, sourceId: string) {
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

function alternateMocCode(alternate: RebrickableAlternate) {
  return alternate.set_num ?? (alternate.moc_id ? `MOC-${alternate.moc_id}` : null);
}

function alternateMocId(alternate: RebrickableAlternate) {
  const code = alternateMocCode(alternate);
  const match = code?.match(/^MOC-(\d+)$/i);

  if (match) {
    return Number(match[1]);
  }

  return alternate.moc_id ?? null;
}

function partAssetId(item: RebrickableInventoryPart) {
  return item.element_id?.trim() || `${item.part.part_num}-${item.color.id}`;
}

function partColorImageUrl(option: RebrickablePartColor) {
  return option.part_img_url ?? null;
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

function escapeLikeValue(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
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

function createJob(sourceType: DownloadSourceType, sourceId: string) {
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

function getActiveDownloadJob(sourceType: DownloadSourceType, sourceId: string) {
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

async function runPartCatalogDownload(jobId: number, signal: AbortSignal): Promise<ActionResult> {
  updateJobProgress(jobId, {
    stage: "获取零件索引",
    current: 0,
    detail: "正在读取 Rebrickable 全量零件和颜色列表",
  });

  try {
    throwIfCancelled(signal);
    const [allParts, allColors, partCategories] = await Promise.all([
      rebrickableClient.getAllParts(signal),
      rebrickableClient.getColors(signal),
      rebrickableClient.getPartCategories(signal),
    ]);
    const categoryNames = new Map(partCategories.map((category) => [category.id, category.name]));
    const now = new Date();

    updateJobProgress(jobId, {
      stage: "写入基础数据",
      current: 0,
      total: allParts.length,
      detail: `正在写入 ${allParts.length} 个零件、${partCategories.length} 个分类和 ${allColors.length} 个颜色`,
    });

    throwIfCancelled(signal);
    db.transaction((tx) => {
      for (const color of allColors) {
        tx.insert(colors)
          .values({
            id: color.id,
            name: color.name,
            rgb: color.rgb,
            isTransparent: color.is_trans ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: colors.id,
            set: {
              name: color.name,
              rgb: color.rgb,
              isTransparent: color.is_trans ?? false,
              updatedAt: now,
            },
          })
          .run();
      }

      for (const part of allParts) {
        const categoryName =
          part.part_cat_id === undefined ? null : (categoryNames.get(part.part_cat_id) ?? null);

        tx.insert(parts)
          .values({
            partNum: part.part_num,
            name: part.name,
            categoryId: part.part_cat_id,
            categoryName,
            imageUrl: part.part_img_url,
            rawJson: JSON.stringify(part),
            downloadedAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: parts.partNum,
            set: {
              name: part.name,
              categoryId: part.part_cat_id,
              categoryName,
              imageUrl: part.part_img_url,
              rawJson: JSON.stringify(part),
              downloadedAt: now,
              updatedAt: now,
            },
          })
          .run();
      }
    });

    let processedParts = 0;
    let optionCount = 0;

    for (const part of allParts) {
      throwIfCancelled(signal);
      const existingOptions = db
        .select({ value: count() })
        .from(partColorOptions)
        .where(eq(partColorOptions.partNum, part.part_num))
        .get();

      if (existingOptions && existingOptions.value > 0) {
        processedParts += 1;
        optionCount += existingOptions.value;
        updateJobProgress(jobId, {
          stage: "复用零件配色",
          current: processedParts,
          total: allParts.length,
          detail: `${part.part_num}：已存在 ${existingOptions.value} 个可用配色`,
        });
        continue;
      }

      const options = await rebrickableClient.getPartColors(part.part_num, signal);

      db.transaction((tx) => {
        tx.delete(partColorOptions).where(eq(partColorOptions.partNum, part.part_num)).run();

        for (const option of options) {
          tx.insert(colors)
            .values({
              id: option.color_id,
              name: option.color_name,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: colors.id,
              set: {
                name: option.color_name,
                updatedAt: now,
              },
            })
            .run();

          tx.insert(partColorOptions)
            .values({
              partNum: part.part_num,
              colorId: option.color_id,
              imageUrl: partColorImageUrl(option),
              elementIds: JSON.stringify(option.elements ?? []),
              numSets: option.num_sets,
              rawJson: JSON.stringify(option),
              downloadedAt: now,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [partColorOptions.partNum, partColorOptions.colorId],
              set: {
                imageUrl: partColorImageUrl(option),
                elementIds: JSON.stringify(option.elements ?? []),
                numSets: option.num_sets,
                rawJson: JSON.stringify(option),
                downloadedAt: now,
                updatedAt: now,
              },
            })
            .run();
        }
      });

      processedParts += 1;
      optionCount += options.length;
      updateJobProgress(jobId, {
        stage: "获取零件配色",
        current: processedParts,
        total: allParts.length,
        detail: `${part.part_num}：${options.length} 个可用配色`,
      });
    }

    finishJob(
      jobId,
      "completed",
      `已缓存 ${allParts.length} 个零件和 ${optionCount} 条零件配色。`,
      {
        stage: "完成",
        current: allParts.length,
        total: allParts.length,
        detail: `${optionCount} 条零件配色可用于过滤 MOC 清单`,
      },
    );

    return { ok: true, message: "全量零件配色索引已下载到本地。" };
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
          ["parts", partAssetId(item)],
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
      const mocCode = alternateMocCode(alternate) ?? "unknown";
      const localImageUrl =
        (await downloadImage(
          alternate.moc_img_url,
          ["sets", set.set_num, "mocs", mocCode],
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
        detail: `Alternate ${mocCode}：${alternate.name}`,
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
            imageUrl,
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
              imageUrl,
              quantity: item.quantity,
              rawJson: JSON.stringify(item),
              updatedAt: now,
            },
          })
          .run();
      }

      for (const { alternate, imageUrl } of alternatesWithImages) {
        const mocId = alternateMocId(alternate);

        if (!mocId) {
          continue;
        }

        tx.insert(mocs)
          .values({
            mocId,
            name: alternate.name,
            designerName: alternate.designer_name,
            sourceSetNum: set.set_num,
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
            sourceSetNum: set.set_num,
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

export function startDownloadPartCatalog(): ActionResult {
  const sourceId = "parts-colors";
  const key = targetKey("catalog", sourceId);
  const activeJob = activeDownloads.get(key);
  const existingJobId = activeJob?.jobId ?? getActiveDownloadJob("catalog", sourceId)?.id;

  if (existingJobId) {
    return {
      ok: false,
      message: `全量零件配色索引已有下载任务正在运行，请等待完成或先取消任务 #${existingJobId}。`,
    };
  }

  const controller = new AbortController();
  const job = createJob("catalog", sourceId);
  activeDownloads.set(key, { controller, jobId: job.id });

  void runPartCatalogDownload(job.id, controller.signal).finally(() => {
    const activeJob = activeDownloads.get(key);

    if (activeJob?.jobId === job.id) {
      activeDownloads.delete(key);
    }
  });

  return { ok: true, message: "全量零件配色索引下载任务已启动。" };
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
  const [partColorCount] = db.select({ value: count() }).from(partColorOptions).all();
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
      partColors: partColorCount.value,
      mocs: mocCount.value,
    },
    latestSets,
    latestMocs,
    latestJobs,
  };
}

export function getPartCatalogSummary() {
  const [partCount] = db.select({ value: count() }).from(parts).all();
  const [colorCount] = db.select({ value: count() }).from(colors).all();
  const [partColorCount] = db.select({ value: count() }).from(partColorOptions).all();
  const latestCatalogJob = db
    .select()
    .from(downloadJobs)
    .where(and(eq(downloadJobs.sourceType, "catalog"), eq(downloadJobs.sourceId, "parts-colors")))
    .orderBy(desc(downloadJobs.updatedAt))
    .limit(1)
    .get();

  return {
    partCount: partCount.value,
    colorCount: colorCount.value,
    partColorCount: partColorCount.value,
    latestCatalogJob,
  };
}

export function getPartExplorerData(filters: PartExplorerFilters = {}) {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 48, 12), 96);
  const conditions: SQL[] = [];
  const searchQuery = filters.query?.trim();

  if (searchQuery) {
    const pattern = `%${escapeLikeValue(searchQuery)}%`;
    const searchCondition = or(
      like(parts.partNum, pattern),
      like(parts.name, pattern),
      like(parts.categoryName, pattern),
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (filters.categoryId !== undefined) {
    conditions.push(eq(parts.categoryId, filters.categoryId));
  }

  const partWhere = conditions.length > 0 ? and(...conditions) : undefined;
  const colorWhere =
    filters.colorId !== undefined ? eq(partColorOptions.colorId, filters.colorId) : undefined;
  const whereClause = partWhere && colorWhere ? and(partWhere, colorWhere) : partWhere ?? colorWhere;
  const [totalRow] =
    filters.colorId !== undefined
      ? db
          .select({ value: sql<number>`count(distinct ${parts.partNum})` })
          .from(parts)
          .innerJoin(partColorOptions, eq(parts.partNum, partColorOptions.partNum))
          .where(whereClause)
          .all()
      : db.select({ value: count() }).from(parts).where(whereClause).all();
  const total = totalRow.value;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const currentPage = Math.min(Math.max(filters.page ?? 1, 1), totalPages);
  const offset = (currentPage - 1) * pageSize;
  const partRows =
    filters.colorId !== undefined
      ? db
          .select({ part: parts })
          .from(parts)
          .innerJoin(partColorOptions, eq(parts.partNum, partColorOptions.partNum))
          .where(whereClause)
          .orderBy(asc(parts.name), asc(parts.partNum))
          .limit(pageSize)
          .offset(offset)
          .all()
          .map((row) => row.part)
      : db
          .select()
          .from(parts)
          .where(whereClause)
          .orderBy(asc(parts.name), asc(parts.partNum))
          .limit(pageSize)
          .offset(offset)
          .all();
  const partNums = partRows.map((part) => part.partNum);
  const colorRows =
    partNums.length === 0
      ? []
      : db
          .select({
            partNum: partColorOptions.partNum,
            colorId: partColorOptions.colorId,
            colorName: colors.name,
            colorRgb: colors.rgb,
            imageUrl: partColorOptions.imageUrl,
            numSets: partColorOptions.numSets,
            elementIds: partColorOptions.elementIds,
          })
          .from(partColorOptions)
          .innerJoin(colors, eq(partColorOptions.colorId, colors.id))
          .where(inArray(partColorOptions.partNum, partNums))
          .orderBy(asc(partColorOptions.partNum), desc(partColorOptions.numSets), asc(colors.name))
          .all();
  const colorsByPart = new Map<string, typeof colorRows>();

  for (const row of colorRows) {
    colorsByPart.set(row.partNum, [...(colorsByPart.get(row.partNum) ?? []), row]);
  }

  const categories = db
    .select({
      id: parts.categoryId,
      name: parts.categoryName,
      count: count(),
    })
    .from(parts)
    .where(sql`${parts.categoryId} is not null`)
    .groupBy(parts.categoryId, parts.categoryName)
    .orderBy(asc(parts.categoryName))
    .all()
    .flatMap((category) =>
      category.id === null
        ? []
        : [
            {
              id: category.id,
              name: category.name ?? `分类 ${category.id}`,
              count: category.count,
            },
          ],
    );
  const availableColors = db
    .select({
      id: colors.id,
      name: colors.name,
      rgb: colors.rgb,
      count: sql<number>`count(distinct ${partColorOptions.partNum})`,
    })
    .from(colors)
    .innerJoin(partColorOptions, eq(colors.id, partColorOptions.colorId))
    .groupBy(colors.id, colors.name, colors.rgb)
    .orderBy(asc(colors.name))
    .all();

  return {
    filters: {
      query: searchQuery ?? "",
      categoryId: filters.categoryId,
      colorId: filters.colorId,
    },
    parts: partRows.map((part) => ({
      ...part,
      colors: colorsByPart.get(part.partNum) ?? [],
    })),
    categories,
    colors: availableColors,
    pagination: {
      page: currentPage,
      pageSize,
      total,
      totalPages,
    },
  };
}

export function getSetListData() {
  const [setCount] = db.select({ value: count() }).from(sets).all();
  const allSets = db
    .select()
    .from(sets)
    .orderBy(desc(sets.updatedAt))
    .all();
  const inventoryRows = db
    .select({
      setNum: setParts.setNum,
      quantity: setParts.quantity,
      isSpare: setParts.isSpare,
    })
    .from(setParts)
    .all();
  const inventoryBySet = new Map<
    string,
    { rowCount: number; quantity: number; spareRows: number }
  >();

  for (const row of inventoryRows) {
    const current = inventoryBySet.get(row.setNum) ?? {
      rowCount: 0,
      quantity: 0,
      spareRows: 0,
    };

    current.rowCount += 1;
    current.quantity += row.quantity;
    current.spareRows += row.isSpare ? 1 : 0;
    inventoryBySet.set(row.setNum, current);
  }

  return {
    count: setCount.value,
    sets: allSets.map((set) => ({
      ...set,
      inventory: inventoryBySet.get(set.setNum) ?? {
        rowCount: 0,
        quantity: 0,
        spareRows: 0,
      },
      assetBaseUrl: `/rebrickable-assets/sets/${set.setNum}`,
    })),
  };
}

export function getSetDetailData(setNum: string) {
  const set = db.select().from(sets).where(eq(sets.setNum, setNum)).get();

  if (!set) {
    return null;
  }

  const inventoryRows = db
    .select({
      partNum: setParts.partNum,
      partName: parts.name,
      partCategoryName: parts.categoryName,
      colorName: colors.name,
      colorRgb: colors.rgb,
      elementId: setParts.elementId,
      quantity: setParts.quantity,
      isSpare: setParts.isSpare,
      imageUrl: setParts.imageUrl,
      partImageUrl: parts.imageUrl,
    })
    .from(setParts)
    .innerJoin(parts, eq(setParts.partNum, parts.partNum))
    .innerJoin(colors, eq(setParts.colorId, colors.id))
    .where(eq(setParts.setNum, setNum))
    .orderBy(asc(setParts.isSpare), desc(setParts.quantity), asc(parts.name))
    .all();
  const inventory = inventoryRows.map(({ partImageUrl, ...item }) => ({
    ...item,
    imageUrl: item.imageUrl ?? partImageUrl,
  }));

  const [setCount] = db.select({ value: count() }).from(sets).all();
  const alternateWhere =
    setCount.value === 1
      ? or(eq(mocs.sourceSetNum, setNum), isNull(mocs.sourceSetNum))
      : eq(mocs.sourceSetNum, setNum);
  const alternates = db
    .select()
    .from(mocs)
    .where(alternateWhere)
    .orderBy(desc(mocs.numParts), asc(mocs.name))
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
    alternates,
    assetBaseUrl: `/rebrickable-assets/sets/${setNum}`,
    inventoryFiles: [
      {
        name: "inventory.json",
        href: `/rebrickable-assets/sets/${setNum}/inventory.json`,
      },
      {
        name: "inventory.csv",
        href: `/rebrickable-assets/sets/${setNum}/inventory.csv`,
      },
    ],
    latestJob,
  };
}
