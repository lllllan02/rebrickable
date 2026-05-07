"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  saveRebrickableApiKey,
  startDownloadMocById,
  startDownloadPartCatalog,
  startDownloadSetById,
  type ActionResult,
} from "@/lib/rebrickable/downloads";

const apiKeySchema = z.object({
  apiKey: z.string().trim().min(1, "API Key 不能为空。"),
});

const setDownloadSchema = z.object({
  setNum: z.string().trim().min(1, "Set ID 不能为空。"),
});

const mocDownloadSchema = z.object({
  mocId: z.string().trim().min(1, "MOC ID 不能为空。"),
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

function revalidateMocPaths(rawMocId: string) {
  revalidatePath("/");
  revalidatePath("/mocs");
  const mocId = Number(rawMocId.trim().replace(/^MOC-/i, ""));
  if (Number.isInteger(mocId) && mocId > 0) {
    revalidatePath(`/mocs/${mocId}`);
  }
}

export async function downloadMocAction(formData: FormData) {
  const parsed = mocDownloadSchema.safeParse({
    mocId: formValue(formData, "mocId"),
  });

  if (!parsed.success) {
    return;
  }

  startDownloadMocById(parsed.data.mocId);
  revalidateMocPaths(parsed.data.mocId);
}

export async function downloadMocFormAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = mocDownloadSchema.safeParse({
    mocId: formValue(formData, "mocId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "MOC ID 不能为空。" };
  }

  const result = startDownloadMocById(parsed.data.mocId);
  revalidateMocPaths(parsed.data.mocId);

  return result;
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
