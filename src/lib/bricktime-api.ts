import "server-only";

import { createHash } from "node:crypto";

const BRICKTIME_TIMEOUT_MS = 15_000;
const BRICKTIME_ORIGIN = "https://www.bricktime.info";
const BRICKTIME_API_V1 = `${BRICKTIME_ORIGIN}/api-v1`;
const SESSION_TTL_MS = 5 * 60 * 1000;
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

type BricktimeSession = {
  cookie: string | null;
  code: string;
  fetchedAt: number;
};

export type BricktimeApiKeyInfo = {
  apiKey: string;
  expiresAt: string | null;
};

type BricktimeApiKeyRecord = {
  api_key?: string;
  expires_at?: string | null;
};

let cachedSession: BricktimeSession | null = null;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function parseHiddenCode(html: string): string | null {
  const m = html.match(/id="code"[^>]*>([^<]+)</);
  const code = m?.[1]?.trim();
  return code && code.length > 0 ? code : null;
}

function parseSetCookie(headers: Headers): string | null {
  const getSetCookie = (
    headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie?.();
  if (getSetCookie?.length) {
    return getSetCookie.map((item) => item.split(";")[0]?.trim()).filter(Boolean).join("; ");
  }
  const single = headers.get("set-cookie");
  if (!single) return null;
  return single
    .split(",")
    .map((item) => item.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = BRICKTIME_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function getBricktimeSession(force = false): Promise<BricktimeSession> {
  if (
    !force &&
    cachedSession &&
    Date.now() - cachedSession.fetchedAt < SESSION_TTL_MS
  ) {
    return cachedSession;
  }

  const res = await fetchWithTimeout(`${BRICKTIME_ORIGIN}/api-v1`, {
    headers: {
      accept: "text/html,application/json",
      "user-agent": BROWSER_UA,
      referer: `${BRICKTIME_ORIGIN}/`,
    },
  });
  if (!res.ok) {
    throw new Error(`Bricktime 会话初始化失败（${res.status}）`);
  }

  const html = await res.text();
  const code = parseHiddenCode(html);
  if (!code) {
    throw new Error("Bricktime 会话初始化失败（缺少签名 code）");
  }

  cachedSession = {
    cookie: parseSetCookie(res.headers),
    code,
    fetchedAt: Date.now(),
  };
  return cachedSession;
}

function buildSignedUrl(base: string, path: string, code: string): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = sha256Hex([...code].reverse().join("") + ts);
  return `${base}${path}?sha256=${encodeURIComponent(sig)}&ts=${encodeURIComponent(ts)}`;
}

function parseApiError(payload: unknown, fallback: string): string {
  const envelope = payload as {
    message?: string;
    error?: string;
    msg?: string;
  };
  return (
    envelope.message?.trim() ||
    envelope.error?.trim() ||
    envelope.msg?.trim() ||
    fallback
  );
}

export async function bricktimeSignedJson<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; apiKey?: string | null } = {}
): Promise<T> {
  const session = await getBricktimeSession();
  const url = buildSignedUrl(BRICKTIME_API_V1, path, session.code);
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": BROWSER_UA,
    referer: `${BRICKTIME_ORIGIN}/api-v1`,
    origin: BRICKTIME_ORIGIN,
  };
  if (session.cookie) headers.cookie = session.cookie;
  if (init.apiKey) headers["X-API-Key"] = init.apiKey;

  const res = await fetchWithTimeout(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body != null ? JSON.stringify(init.body) : undefined,
  });

  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Bricktime 返回非 JSON（${res.status}）`);
  }

  const envelope = payload as {
    success?: boolean;
    status?: number;
    message?: string;
    error?: string;
    code?: number;
    msg?: string;
  };

  if (!res.ok) {
    throw new Error(parseApiError(payload, `Bricktime 返回 ${res.status}`));
  }

  if (envelope.success === false) {
    throw new Error(parseApiError(payload, "Bricktime 请求失败"));
  }

  if (typeof envelope.code === "number" && envelope.code !== 0 && envelope.code !== 200) {
    throw new Error(parseApiError(payload, `Bricktime 返回 ${envelope.code}`));
  }

  if (typeof envelope.status === "number" && envelope.status !== 200) {
    throw new Error(parseApiError(payload, `Bricktime 返回 ${envelope.status}`));
  }

  return payload as T;
}

function normalizeApiKeyRecord(data: BricktimeApiKeyRecord | null | undefined): BricktimeApiKeyInfo | null {
  const apiKey = data?.api_key?.trim();
  if (!apiKey) return null;
  const expiresAt = data?.expires_at?.trim() || null;
  return { apiKey, expiresAt };
}

export async function fetchBricktimeApiKeyByUuid(userUuid: string): Promise<BricktimeApiKeyInfo | null> {
  const userRes = await bricktimeSignedJson<{
    success?: boolean;
    data?: BricktimeApiKeyRecord | null;
  }>(`/api-keys/user/${encodeURIComponent(userUuid)}`);
  return normalizeApiKeyRecord(userRes.data);
}

export async function createBricktimeApiKey(userUuid: string): Promise<BricktimeApiKeyInfo> {
  const createRes = await bricktimeSignedJson<{
    success?: boolean;
    data?: BricktimeApiKeyRecord;
    message?: string;
  }>("/api-keys/create", {
    method: "POST",
    body: { user_uuid: userUuid, tier: "free" },
  });

  const created = normalizeApiKeyRecord(createRes.data);
  if (!created) {
    throw new Error(createRes.message?.trim() || "Bricktime API Key 申请失败");
  }
  return created;
}

export async function fetchOrCreateBricktimeApiKey(userUuid: string): Promise<BricktimeApiKeyInfo> {
  const existing = await fetchBricktimeApiKeyByUuid(userUuid);
  if (existing) return existing;
  return createBricktimeApiKey(userUuid);
}

export function isBricktimeApiKeyExpired(expiresAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!expiresAt?.trim()) return false;
  const normalized = expiresAt.trim().includes("T")
    ? expiresAt.trim()
    : expiresAt.trim().replace(" ", "T");
  const ts = Date.parse(normalized);
  if (!Number.isFinite(ts)) return false;
  return ts <= nowMs;
}
