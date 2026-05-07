import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";

import type {
  PaginatedResponse,
  RebrickableColor,
  RebrickableInventoryPart,
  RebrickablePart,
  RebrickablePartCategory,
  RebrickablePartColor,
  RebrickableSet,
} from "./types";

const baseUrl = "https://rebrickable.com/api/v3";
const maxThrottleRetries = 8;
const defaultRequestIntervalMs = 250;
const defaultMaxConcurrentRequests = 6;

type QueuedRequest = {
  run: () => void;
};

class RebrickableRateLimiter {
  private queue: QueuedRequest[] = [];
  private activeRequests = 0;
  private nextRequestAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly maxConcurrent: number,
  ) {}

  schedule<T>(task: () => Promise<T>, signal?: AbortSignal) {
    if (signal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    }

    return new Promise<T>((resolve, reject) => {
      const run = () => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }

        this.activeRequests += 1;
        this.nextRequestAt = Date.now() + this.intervalMs;

        task()
          .then(resolve, reject)
          .finally(() => {
            this.activeRequests -= 1;
            this.drain();
          });
      };
      const queuedRun = () => {
        signal?.removeEventListener("abort", abort);
        run();
      };
      const abort = () => {
        this.queue = this.queue.filter((item) => item.run !== queuedRun);
        reject(new DOMException("Aborted", "AbortError"));
      };

      signal?.addEventListener("abort", abort, { once: true });
      this.queue.push({ run: queuedRun });
      this.drain();
    });
  }

  pauseFor(ms: number) {
    this.nextRequestAt = Math.max(this.nextRequestAt, Date.now() + ms);
    this.drain();
  }

  private drain() {
    if (this.timer) {
      return;
    }

    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const delay = Math.max(0, this.nextRequestAt - Date.now());

    this.timer = setTimeout(() => {
      this.timer = null;
      const next = this.queue.shift();

      next?.run();
      this.drain();
    }, delay);
  }
}

function positiveIntegerFromEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const rateLimiter = new RebrickableRateLimiter(
  positiveIntegerFromEnv("REBRICKABLE_API_INTERVAL_MS", defaultRequestIntervalMs),
  positiveIntegerFromEnv("REBRICKABLE_API_MAX_CONCURRENCY", defaultMaxConcurrentRequests),
);

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

function retryAfterSeconds(response: Response, body: string) {
  const retryAfter = Number(response.headers.get("retry-after"));

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter;
  }

  const expectedAvailable = body.match(/Expected available in (\d+) seconds/i);

  if (expectedAvailable) {
    return Number(expectedAvailable[1]);
  }

  return 15;
}

function wait(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };

    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const apiKey = await getApiKey();

  if (!apiKey) {
    throw new RebrickableApiError("请先配置 Rebrickable API Key。");
  }

  for (let attempt = 0; attempt <= maxThrottleRetries; attempt += 1) {
    const response = await rateLimiter.schedule(
      () =>
        fetch(`${baseUrl}${path}`, {
          headers: {
            Authorization: `key ${apiKey}`,
            Accept: "application/json",
          },
          cache: "no-store",
          signal,
        }),
      signal,
    );

    if (response.ok) {
      return (await response.json()) as T;
    }

    const body = await response.text();

    if (response.status === 429 && attempt < maxThrottleRetries) {
      const waitSeconds = retryAfterSeconds(response, body) + 1;
      rateLimiter.pauseFor(waitSeconds * 1000);
      await wait(waitSeconds * 1000, signal);
      continue;
    }

    throw new RebrickableApiError(
      `Rebrickable 请求失败：${response.status} ${body}`,
      response.status,
    );
  }

  throw new RebrickableApiError("Rebrickable 请求失败：超过限流重试次数。", 429);
}

async function requestAllPages<T>(path: string, signal?: AbortSignal) {
  const items: T[] = [];
  let url = `${path}${path.includes("?") ? "&" : "?"}page_size=1000`;

  while (url) {
    const page = await request<PaginatedResponse<T>>(url, signal);
    items.push(...page.results);
    url = page.next ? page.next.replace(baseUrl, "") : "";
  }

  return items;
}

export const rebrickableClient = {
  getAllParts(signal?: AbortSignal) {
    return requestAllPages<RebrickablePart>("/lego/parts/", signal);
  },

  getPartCategories(signal?: AbortSignal) {
    return requestAllPages<RebrickablePartCategory>("/lego/part_categories/", signal);
  },

  getColors(signal?: AbortSignal) {
    return requestAllPages<RebrickableColor>("/lego/colors/", signal);
  },

  getPartColors(partNum: string, signal?: AbortSignal) {
    return requestAllPages<RebrickablePartColor>(
      `/lego/parts/${encodeURIComponent(partNum)}/colors/`,
      signal,
    );
  },

  getSet(setNum: string, signal?: AbortSignal) {
    return request<RebrickableSet>(`/lego/sets/${encodeURIComponent(setNum)}/`, signal);
  },

  getSetParts(setNum: string, signal?: AbortSignal) {
    return requestAllPages<RebrickableInventoryPart>(
      `/lego/sets/${encodeURIComponent(setNum)}/parts/`,
      signal,
    );
  },
};
