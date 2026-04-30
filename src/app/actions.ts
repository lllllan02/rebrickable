"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  downloadMocById,
  saveRebrickableApiKey,
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
