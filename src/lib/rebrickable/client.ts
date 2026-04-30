import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";

import type {
  PaginatedResponse,
  RebrickableAlternate,
  RebrickableInventoryPart,
  RebrickableSet,
} from "./types";

const baseUrl = "https://rebrickable.com/api/v3";

class RebrickableApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "RebrickableApiError";
  }
}

export { RebrickableApiError };

async function getApiKey() {
  if (process.env.REBRICKABLE_API_KEY) {
    return process.env.REBRICKABLE_API_KEY;
  }

  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "rebrickable_api_key"))
    .get();

  return row?.value;
}

async function request<T>(path: string): Promise<T> {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new RebrickableApiError("请先配置 Rebrickable API Key。");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `key ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new RebrickableApiError(
      `Rebrickable 请求失败：${response.status} ${body}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

async function requestAllPages<T>(path: string) {
  const items: T[] = [];
  let url = `${path}${path.includes("?") ? "&" : "?"}page_size=1000`;

  while (url) {
    const page = await request<PaginatedResponse<T>>(url);
    items.push(...page.results);
    url = page.next ? page.next.replace(baseUrl, "") : "";
  }

  return items;
}

export const rebrickableClient = {
  getSet(setNum: string) {
    return request<RebrickableSet>(`/lego/sets/${encodeURIComponent(setNum)}/`);
  },

  getSetParts(setNum: string) {
    return requestAllPages<RebrickableInventoryPart>(
      `/lego/sets/${encodeURIComponent(setNum)}/parts/`,
    );
  },

  getSetAlternates(setNum: string) {
    return requestAllPages<RebrickableAlternate>(
      `/lego/sets/${encodeURIComponent(setNum)}/alternates/`,
    );
  },
};
