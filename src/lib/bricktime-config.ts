import "server-only";

import { eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildBricktimeConfig } from "@/db/schema";
import {
  createBricktimeApiKey,
  fetchBricktimeApiKeyByUuid,
  fetchOrCreateBricktimeApiKey,
  isBricktimeApiKeyExpired,
  type BricktimeApiKeyInfo,
} from "@/lib/bricktime-api";
import type { BricktimeConfigPublic } from "@/lib/bricktime-config-types";

const BRICKTIME_CONFIG_ID = 1;
const EXPIRY_BUFFER_MS = 60_000;

export type BricktimeConfigRecord = {
  userUuid: string | null;
  apiKey: string | null;
  apiKeyExpiresAt: string | null;
  updatedAt: string | null;
};

function maskApiKey(apiKey: string | null | undefined): string | null {
  const key = apiKey?.trim();
  if (!key) return null;
  if (key.length <= 8) return `${key.slice(0, 2)}••••`;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function parseBricktimeUuid(raw: unknown): string | null {
  const uuid = String(raw ?? "").trim().toLowerCase();
  if (!uuid) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid)) {
    return null;
  }
  return uuid;
}

export function parseBricktimeApiKey(raw: unknown): string | null {
  const key = String(raw ?? "").trim();
  if (!key) return null;
  if (!/^[0-9a-f]{32}$/i.test(key)) return null;
  return key.toLowerCase();
}

function rowToRecord(row: typeof buildBricktimeConfig.$inferSelect | undefined): BricktimeConfigRecord {
  return {
    userUuid: row?.userUuid ?? null,
    apiKey: row?.apiKey ?? null,
    apiKeyExpiresAt: row?.apiKeyExpiresAt ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export function toBricktimeConfigPublic(record: BricktimeConfigRecord): BricktimeConfigPublic {
  const hasApiKey = Boolean(record.apiKey?.trim());
  const isExpired =
    hasApiKey &&
    isBricktimeApiKeyExpired(record.apiKeyExpiresAt, Date.now() + EXPIRY_BUFFER_MS);
  return {
    userUuid: record.userUuid,
    apiKeyMasked: maskApiKey(record.apiKey),
    apiKeyExpiresAt: record.apiKeyExpiresAt,
    updatedAt: record.updatedAt,
    hasApiKey,
    isExpired,
  };
}

export async function loadBricktimeConfigRecord(): Promise<BricktimeConfigRecord> {
  const db = getUserDb();
  const [row] = await db
    .select()
    .from(buildBricktimeConfig)
    .where(eq(buildBricktimeConfig.id, BRICKTIME_CONFIG_ID))
    .limit(1);
  return rowToRecord(row);
}

export async function loadBricktimeConfigPublic(): Promise<BricktimeConfigPublic> {
  return toBricktimeConfigPublic(await loadBricktimeConfigRecord());
}

async function saveBricktimeConfigRecord(input: {
  userUuid?: string | null;
  apiKey?: string | null;
  apiKeyExpiresAt?: string | null;
}): Promise<BricktimeConfigRecord> {
  const db = getUserDb();
  const current = await loadBricktimeConfigRecord();
  const updatedAt = new Date().toISOString();
  const next: BricktimeConfigRecord = {
    userUuid: input.userUuid !== undefined ? input.userUuid : current.userUuid,
    apiKey: input.apiKey !== undefined ? input.apiKey : current.apiKey,
    apiKeyExpiresAt:
      input.apiKeyExpiresAt !== undefined ? input.apiKeyExpiresAt : current.apiKeyExpiresAt,
    updatedAt,
  };

  await db
    .insert(buildBricktimeConfig)
    .values({
      id: BRICKTIME_CONFIG_ID,
      userUuid: next.userUuid,
      apiKey: next.apiKey,
      apiKeyExpiresAt: next.apiKeyExpiresAt,
      updatedAt: next.updatedAt!,
    })
    .onConflictDoUpdate({
      target: buildBricktimeConfig.id,
      set: {
        userUuid: next.userUuid,
        apiKey: next.apiKey,
        apiKeyExpiresAt: next.apiKeyExpiresAt,
        updatedAt: next.updatedAt!,
      },
    });

  return next;
}

async function persistApiKeyInfo(
  userUuid: string | null,
  info: BricktimeApiKeyInfo
): Promise<BricktimeConfigRecord> {
  return saveBricktimeConfigRecord({
    userUuid,
    apiKey: info.apiKey,
    apiKeyExpiresAt: info.expiresAt,
  });
}

function isStoredApiKeyUsable(record: BricktimeConfigRecord): boolean {
  if (!record.apiKey?.trim()) return false;
  if (!record.apiKeyExpiresAt?.trim()) return true;
  return !isBricktimeApiKeyExpired(record.apiKeyExpiresAt, Date.now() + EXPIRY_BUFFER_MS);
}

export async function saveBricktimeUserUuid(userUuid: string): Promise<BricktimeConfigPublic> {
  await saveBricktimeConfigRecord({ userUuid });
  return refreshBricktimeApiKeyFromStoredUuid();
}

export async function saveBricktimeManualApiKey(apiKey: string): Promise<BricktimeConfigPublic> {
  const record = await saveBricktimeConfigRecord({
    apiKey,
    apiKeyExpiresAt: null,
  });
  return toBricktimeConfigPublic(record);
}

export async function refreshBricktimeApiKeyFromStoredUuid(): Promise<BricktimeConfigPublic> {
  const current = await loadBricktimeConfigRecord();
  const userUuid = current.userUuid?.trim();
  if (!userUuid) {
    throw new Error("请先填写 Bricktime UUID。");
  }

  let info = await fetchBricktimeApiKeyByUuid(userUuid);
  if (!info || isBricktimeApiKeyExpired(info.expiresAt, Date.now() + EXPIRY_BUFFER_MS)) {
    info = await createBricktimeApiKey(userUuid);
  }

  const saved = await persistApiKeyInfo(userUuid, info);
  return toBricktimeConfigPublic(saved);
}

export async function ensureBricktimeApiKey(forceRefresh = false): Promise<string> {
  const envKey = process.env.BRICKTIME_API_KEY?.trim();
  if (envKey) return envKey;

  const record = await loadBricktimeConfigRecord();
  if (!forceRefresh && isStoredApiKeyUsable(record)) {
    return record.apiKey!.trim();
  }

  if (record.apiKey?.trim() && !record.userUuid?.trim()) {
    return record.apiKey.trim();
  }

  const userUuid = record.userUuid?.trim() || process.env.BRICKTIME_UUID?.trim();
  if (!userUuid) {
    throw new Error("请先在好价榜配置 Bricktime UUID 或 API Key。");
  }

  let info = await fetchOrCreateBricktimeApiKey(userUuid);
  if (isBricktimeApiKeyExpired(info.expiresAt, Date.now() + EXPIRY_BUFFER_MS)) {
    info = await createBricktimeApiKey(userUuid);
  }

  await persistApiKeyInfo(userUuid, info);
  return info.apiKey;
}
