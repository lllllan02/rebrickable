"use server";

import { revalidatePath } from "next/cache";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { db } from "@/db/client";
import { partColorOptions } from "@/db/schema";
import {
  downloadMocById,
  saveRebrickableApiKey,
  startDownloadPartCatalog,
  startDownloadSetById,
  type ActionResult,
} from "@/lib/rebrickable/downloads";
import {
  filteredMocRowsToCsv,
  filterMocInventory,
  parseMocInventoryCsv,
  rejectedMocRowsToCsv,
} from "@/lib/rebrickable/moc-import";

const apiKeySchema = z.object({
  apiKey: z.string().trim().min(1, "API Key 不能为空。"),
});

const setDownloadSchema = z.object({
  setNum: z.string().trim().min(1, "Set ID 不能为空。"),
});

const mocDownloadSchema = z.object({
  mocId: z.string().trim().min(1, "MOC ID 不能为空。"),
});

export type MocImportActionResult = ActionResult & {
  summary?: {
    totalRows: number;
    filteredRows: number;
    replacedRows: number;
    rejectedRows: number;
    parseWarnings: string[];
  };
  files?: {
    filteredCsv: string;
    rejectedCsv: string;
  };
};

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function saveApiKeyAction(formData: FormData) {
  const parsed = apiKeySchema.safeParse({
    apiKey: formValue(formData, "apiKey"),
  });

  if (!parsed.success) {
    return;
  }

  saveRebrickableApiKey(parsed.data.apiKey);
  revalidatePath("/");
  revalidatePath("/settings");
}

export async function downloadSetAction(formData: FormData) {
  const parsed = setDownloadSchema.safeParse({
    setNum: formValue(formData, "setNum"),
  });

  if (!parsed.success) {
    return;
  }

  startDownloadSetById(parsed.data.setNum);
  revalidatePath("/");
  revalidatePath("/sets");
}

export async function downloadSetFormAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = setDownloadSchema.safeParse({
    setNum: formValue(formData, "setNum"),
  });

  if (!parsed.success) {
    return { ok: false, message: "Set ID 不能为空。" };
  }

  const result = startDownloadSetById(parsed.data.setNum);
  revalidatePath("/");
  revalidatePath("/sets");

  return result;
}

export async function downloadMocAction(formData: FormData) {
  const parsed = mocDownloadSchema.safeParse({
    mocId: formValue(formData, "mocId"),
  });

  if (!parsed.success) {
    return;
  }

  downloadMocById(parsed.data.mocId);
  revalidatePath("/");
}

export async function downloadPartCatalogFormAction(
  _prevState: ActionResult,
): Promise<ActionResult> {
  void _prevState;
  const result = startDownloadPartCatalog();
  revalidatePath("/");
  revalidatePath("/moc-import");

  return result;
}

export async function importMocInventoryFormAction(
  _prevState: MocImportActionResult,
  formData: FormData,
): Promise<MocImportActionResult> {
  const file = formData.get("inventoryFile");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "请选择 Rebrickable 导出的 MOC 零件 CSV 文件。" };
  }

  const options = db
    .select({
      partNum: partColorOptions.partNum,
      colorId: partColorOptions.colorId,
    })
    .from(partColorOptions)
    .all();

  if (options.length === 0) {
    return {
      ok: false,
      message: "本地还没有全量零件配色索引，请先下载索引后再过滤 MOC 清单。",
    };
  }

  const parsed = parseMocInventoryCsv(await file.text());

  if (parsed.rows.length === 0) {
    return {
      ok: false,
      message: parsed.errors[0] ?? "没有识别到可处理的零件行。",
    };
  }

  const result = filterMocInventory(parsed.rows, options);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.csv$/i, "");
  const relativeDirectory = ["rebrickable-assets", "moc-imports", `${timestamp}-${safeName}`];
  const outputDirectory = join(process.cwd(), "public", ...relativeDirectory);
  const filteredCsv = filteredMocRowsToCsv(result.filtered);
  const rejectedCsv = rejectedMocRowsToCsv(result.rejected);

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(outputDirectory, "filtered-for-gobricks.csv"), filteredCsv),
    writeFile(join(outputDirectory, "rejected.csv"), rejectedCsv),
  ]);
  revalidatePath("/moc-import");

  const replacedRows = result.filtered.filter((row) => row.status === "color_replaced").length;

  return {
    ok: true,
    message: `已生成过滤后的 MOC 清单：保留/替换 ${result.filtered.length} 行，拒绝 ${result.rejected.length} 行。`,
    summary: {
      totalRows: parsed.rows.length,
      filteredRows: result.filtered.length,
      replacedRows,
      rejectedRows: result.rejected.length,
      parseWarnings: parsed.errors,
    },
    files: {
      filteredCsv: `/${[...relativeDirectory, "filtered-for-gobricks.csv"].join("/")}`,
      rejectedCsv: `/${[...relativeDirectory, "rejected.csv"].join("/")}`,
    },
  };
}
