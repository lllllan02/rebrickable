"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  saveRebrickableApiKey,
  startDownloadPartCatalog,
  startDownloadSetById,
  type ActionResult,
} from "@/lib/rebrickable/downloads";
import { db } from "@/db/client";
import { mocs } from "@/db/schema";
import { eq } from "drizzle-orm";

import { appendMocAttachments } from "@/lib/moc-attachments";
import { importMocInventory } from "@/lib/moc-import";

const apiKeySchema = z.object({
  apiKey: z.string().trim().min(1, "API Key 不能为空。"),
});

const setDownloadSchema = z.object({
  setNum: z.string().trim().min(1, "Set ID 不能为空。"),
});

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

function revalidateMocPaths(mocId: number) {
  revalidatePath("/");
  revalidatePath("/mocs");
  revalidatePath(`/mocs/${mocId}`);
}

function revalidateSetForMoc(mocId: number) {
  const row = db.select({ sourceSetNum: mocs.sourceSetNum }).from(mocs).where(eq(mocs.mocId, mocId)).get();

  if (row?.sourceSetNum) {
    revalidatePath(`/sets/${encodeURIComponent(row.sourceSetNum)}`);
  }
}

export async function importMocInventoryFormAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  void _prevState;

  const inventoryFile = formData.get("inventory");

  if (!(inventoryFile instanceof File)) {
    return { ok: false, message: "请选择清单文件（.csv 或 .json）。" };
  }

  if (inventoryFile.size === 0) {
    return { ok: false, message: "清单文件不能为空。" };
  }

  const mocIdRaw = formValue(formData, "mocId").trim().replace(/^MOC-/i, "");
  const mocId = Number(mocIdRaw);

  if (!Number.isInteger(mocId) || mocId <= 0) {
    return { ok: false, message: "MOC ID 须为正整数（可与 Rebrickable 上 MOC 编号一致）。" };
  }

  const name = formValue(formData, "name");
  const designerName = formValue(formData, "designerName");
  const sourceSetNumRaw = formValue(formData, "sourceSetNum");
  const rebrickableUrl = formValue(formData, "rebrickableUrl");
  const imageUrl = formValue(formData, "imageUrl");
  const notes = formValue(formData, "notes");

  let text: string;

  try {
    text = await inventoryFile.text();
  } catch {
    return { ok: false, message: "无法读取上传文件。" };
  }

  const result = importMocInventory({
    mocId,
    name,
    designerName: designerName || null,
    sourceSetNum: sourceSetNumRaw || null,
    rebrickableUrl: rebrickableUrl || null,
    imageUrl: imageUrl || null,
    notes: notes || null,
    inventoryText: text,
    inventoryFilename: inventoryFile.name || "inventory.csv",
  });

  if (!result.ok) {
    return result;
  }

  const attachmentFiles = formData
    .getAll("attachments")
    .filter((item): item is File => item instanceof File && item.size > 0);
  const attachmentKind = formValue(formData, "attachmentKind") || "auto";

  if (attachmentFiles.length > 0) {
    const att = await appendMocAttachments(mocId, attachmentFiles, attachmentKind);

    if (!att.ok) {
      revalidateMocPaths(mocId);
      revalidateSetForMoc(mocId);

      return {
        ok: true,
        message: `${result.message}（附件未保存：${att.message}）`,
      };
    }

    revalidateMocPaths(mocId);
    revalidateSetForMoc(mocId);

    return { ok: true, message: `${result.message} ${att.message}`.trim() };
  }

  revalidateMocPaths(mocId);
  revalidateSetForMoc(mocId);

  return result;
}

export async function appendMocAttachmentsFormAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  void _prevState;

  const mocIdRaw = formValue(formData, "mocId").trim().replace(/^MOC-/i, "");
  const mocId = Number(mocIdRaw);

  if (!Number.isInteger(mocId) || mocId <= 0) {
    return { ok: false, message: "MOC ID 无效。" };
  }

  const attachmentFiles = formData
    .getAll("attachments")
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (attachmentFiles.length === 0) {
    return { ok: false, message: "请选择至少一个附件文件。" };
  }

  const attachmentKind = formValue(formData, "attachmentKind") || "auto";
  const att = await appendMocAttachments(mocId, attachmentFiles, attachmentKind);

  if (att.ok) {
    revalidateMocPaths(mocId);
    revalidateSetForMoc(mocId);
  }

  return { ok: att.ok, message: att.ok ? att.message || "已保存附件。" : att.message };
}

export async function downloadPartCatalogFormAction(
  _prevState: ActionResult,
): Promise<ActionResult> {
  void _prevState;
  const result = startDownloadPartCatalog();
  revalidatePath("/");
  revalidatePath("/parts");

  return result;
}
