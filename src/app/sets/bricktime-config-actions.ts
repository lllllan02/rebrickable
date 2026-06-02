"use server";

import { revalidatePath } from "next/cache";

import {
  loadBricktimeConfigPublic,
  parseBricktimeApiKey,
  parseBricktimeUuid,
  refreshBricktimeApiKeyFromStoredUuid,
  saveBricktimeManualApiKey,
  saveBricktimeUserUuid,
} from "@/lib/bricktime-config";
import type { BricktimeConfigPublic } from "@/lib/bricktime-config-types";

export type { BricktimeConfigPublic };

export type BricktimeConfigActionResult =
  | { ok: true; config: BricktimeConfigPublic }
  | { ok: false; error: string };

function revalidateGoodPricePaths() {
  revalidatePath("/sets/prices");
}

export async function getBricktimeConfigAction(): Promise<BricktimeConfigPublic> {
  return loadBricktimeConfigPublic();
}

export async function saveBricktimeConfigAction(input: {
  userUuid?: unknown;
  apiKey?: unknown;
}): Promise<BricktimeConfigActionResult> {
  const uuidRaw = String(input.userUuid ?? "").trim();
  const apiKeyRaw = String(input.apiKey ?? "").trim();

  if (!uuidRaw && !apiKeyRaw) {
    return { ok: false, error: "请至少填写 UUID 或 API Key。" };
  }

  try {
    let config: BricktimeConfigPublic;

    if (uuidRaw && apiKeyRaw) {
      const userUuid = parseBricktimeUuid(uuidRaw);
      if (!userUuid) {
        return { ok: false, error: "UUID 格式不正确。" };
      }
      const apiKey = parseBricktimeApiKey(apiKeyRaw);
      if (!apiKey) {
        return { ok: false, error: "API Key 格式不正确（应为 32 位十六进制）。" };
      }
      await saveBricktimeUserUuid(userUuid);
      config = await saveBricktimeManualApiKey(apiKey);
    } else if (uuidRaw) {
      const userUuid = parseBricktimeUuid(uuidRaw);
      if (!userUuid) {
        return { ok: false, error: "UUID 格式不正确。" };
      }
      config = await saveBricktimeUserUuid(userUuid);
    } else {
      const apiKey = parseBricktimeApiKey(apiKeyRaw);
      if (!apiKey) {
        return { ok: false, error: "API Key 格式不正确（应为 32 位十六进制）。" };
      }
      config = await saveBricktimeManualApiKey(apiKey);
    }

    revalidateGoodPricePaths();
    return { ok: true, config };
  } catch (e) {
    const msg =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "保存 Bricktime 配置失败，请重试。";
    return { ok: false, error: msg };
  }
}

export async function refreshBricktimeApiKeyAction(): Promise<BricktimeConfigActionResult> {
  try {
    const config = await refreshBricktimeApiKeyFromStoredUuid();
    revalidateGoodPricePaths();
    return { ok: true, config };
  } catch (e) {
    const msg =
      e instanceof Error && e.message.trim()
        ? e.message.trim()
        : "刷新 Bricktime API Key 失败，请重试。";
    return { ok: false, error: msg };
  }
}
