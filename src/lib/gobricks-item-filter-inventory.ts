import {
  fetchGobricksLego2ItemListJson,
  type GobricksTestListItem,
} from "@/lib/gobricks-lego2-item-list";

const GOBRICKS_ITEM_FILTER_URL = "https://gobricks.cn/frontend/v1/item/filter";
const GOBRICKS_SEARCH_URL = "https://gobricks.cn/frontend/v1/search/search";
const FILTER_TIMEOUT_MS = 20_000;
const SEARCH_TIMEOUT_MS = 20_000;
const SHEET_REPLACE_SEARCH_PAGE_SIZE = 48;
const SHEET_REPLACE_SEARCH_MAX_PAGES = 4;
const SHEET_REPLACE_SEARCH_MAX_HITS = 160;

/** 与浏览器一致：含 Accept-Language（高砖公开接口无需鉴权） */
function gobricksFrontendJsonHeaders(referer: string): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    Origin: "https://gobricks.cn",
    Referer: referer,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    platform: "pc",
  };
}

/** 从 `GDS-{productId}-{gdsColorId}` 解析高砖商品 product_id */
export function parseGobricksProductIdFromGdsItemId(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const m = /^GDS-(\d+)-/i.exec(s);
  return m?.[1] ?? null;
}

/** 从 `GDS-{productId}-{色段}` 解析高砖色 ID 段（保留前导零），如 `GDS-656-072` → `072` */
export function parseGdsColorSegmentFromGdsItemId(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const m = /^GDS-\d+-(.+)$/i.exec(s);
  const tail = m?.[1]?.trim();
  return tail || null;
}

function readGdsItemIdFromLego2Row(row: Record<string, unknown>): string | null {
  const itemId = typeof row.item_id === "string" && row.item_id.trim() ? row.item_id.trim() : null;
  const info = row.info;
  if (typeof info === "object" && info !== null) {
    const ir = info as Record<string, unknown>;
    const idRaw = ir.id;
    const fromInfo =
      typeof idRaw === "string" && idRaw.trim()
        ? idRaw.trim()
        : typeof idRaw === "number" && Number.isFinite(idRaw)
          ? String(Math.trunc(idRaw))
          : null;
    return itemId ?? fromInfo;
  }
  return itemId;
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
}

function numField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * 用公开 `lego2ItemList` 探测某 design 对应的高砖 `product_id`（来自返回行里的 GDS id）。
 */
export async function resolveGobricksProductIdForPartNum(
  partNum: string,
  probeLegoColorId: number,
  signal?: AbortSignal
): Promise<string | null> {
  const pn = partNum.trim();
  if (!pn) return null;
  const cid = Math.trunc(Number(probeLegoColorId));
  if (!Number.isFinite(cid) || cid < 0) return null;

  const testList: GobricksTestListItem[] = [
    { designid: pn, colorid: String(cid), quantity: 1, color_type: "ldr" },
  ];
  const json = await fetchGobricksLego2ItemListJson(testList, { signal });
  if (typeof json !== "object" || json === null) return null;
  const root = json as Record<string, unknown>;
  const lists = ["itemList", "missList", "colorDeficiency", "inventoryDeficiency", "noSellList", "buyLimitList"];
  for (const key of lists) {
    for (const row of asRecordArray(root[key])) {
      const did = typeof row.designid === "string" ? row.designid.trim().toLowerCase() : "";
      if (!did) continue;
      const want = pn.toLowerCase();
      if (did !== want && !legoDesignQueryMatchesToken(want, did)) continue;
      const gdsId = readGdsItemIdFromLego2Row(row);
      const pid = parseGobricksProductIdFromGdsItemId(gdsId);
      if (pid) return pid;
    }
  }
  return null;
}

function ldrawTokens(ldrawRaw: unknown): string[] {
  if (typeof ldrawRaw !== "string" || !ldrawRaw.trim()) return [];
  return ldrawRaw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 查询串是否为「乐高式」设计号：纯数字或数字+少量尾字母（如 3005a）。
 * 用于区分「30104」与中文关键词，避免对中文走数字专用规则。
 */
function isLegoNumericDesignQuery(s: string): boolean {
  return /^\d{1,6}[a-z]?$/i.test(s.trim());
}

/**
 * 乐高设计号与 `ldraw_no` 中某一 token 是否匹配（如 30104 与 30104a/30104b；排除 gds 前缀自编号）。
 */
function legoDesignQueryMatchesToken(queryLower: string, token: string): boolean {
  const q = queryLower.trim().toLowerCase();
  const t = token.trim().toLowerCase();
  if (!q || !t) return false;
  if (t === q) return true;
  if (t.startsWith("gds")) return false;
  if (!isLegoNumericDesignQuery(q)) {
    return t.includes(q) || q.includes(t);
  }
  if (/^\d/.test(t) && t.startsWith(q)) {
    const rest = t.slice(q.length);
    return rest === "" || /^[a-z]{1,3}$/i.test(rest);
  }
  return false;
}

function readSearchRowTitle(row: Record<string, unknown>): string {
  for (const key of ["caption", "caption_en", "title", "name", "product_name", "goods_name", "item_name"]) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function readSearchRowPicture(row: Record<string, unknown>): string | null {
  for (const key of ["picture", "image", "img", "cover", "thumb", "pic"]) {
    const v = row[key];
    if (typeof v === "string" && v.trim().toLowerCase().startsWith("http")) return v.trim();
  }
  return null;
}

/** 不做与高砖结果的一致性校验：优先 `ldraw_no` 首 token，否则纯数字 `product_id`，否则用户搜索词 */
function pickLegoPartNumForSearchHit(row: Record<string, unknown>, searchKeywordTrimmed: string): string | null {
  const tokens = ldrawTokens(row.ldraw_no);
  if (tokens.length > 0) return tokens[0]!;
  const pid = readProductIdFromSearchRow(row);
  if (pid && /^\d+$/.test(pid)) return pid;
  const kw = searchKeywordTrimmed.trim().slice(0, 32);
  return kw.length > 0 ? kw : null;
}

function readProductIdFromSearchRow(row: Record<string, unknown>): string | null {
  const raw = row.product_id;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw));
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/**
 * 高砖站内搜索 `search?type=item`：直接使用接口返回的 `rows`（不做客户端二次过滤），按库存取 `product_id`。
 */
export async function searchGobricksProductIdByLegoDesignId(
  partNum: string,
  init?: { signal?: AbortSignal }
): Promise<string | null> {
  const pn = partNum.trim();
  if (!pn) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const signal = init?.signal;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      return null;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const url = new URL(GOBRICKS_SEARCH_URL);
  url.searchParams.set("keyword", pn);
  url.searchParams.set("type", "item");
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "48");

  const headers = gobricksFrontendJsonHeaders(`https://gobricks.cn/search?keyword=${encodeURIComponent(pn)}`);

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers,
    });
    const text = await res.text();
    if (!res.ok) return null;
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
    if (typeof json !== "object" || json === null) return null;
    const rowsRaw = (json as Record<string, unknown>).rows;
    const rows = asRecordArray(rowsRaw);
    if (rows.length === 0) return null;

    rows.sort((a, b) => {
      const pa = readProductIdFromSearchRow(a);
      const pb = readProductIdFromSearchRow(b);
      const plainA = pa && /^\d+$/.test(pa) ? 0 : 1;
      const plainB = pb && /^\d+$/.test(pb) ? 0 : 1;
      if (plainA !== plainB) return plainA - plainB;
      const ia = numField(a.inventory);
      const ib = numField(b.inventory);
      return ib - ia;
    });

    return readProductIdFromSearchRow(rows[0]!);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 配货/缺件「更换零件」：高砖站内搜索单条结果（用于列表与选色） */
export type GobricksSearchItemHit = {
  productId: string;
  /** 写入配货/缺件表用的乐高设计号（优先来自 `ldraw_no`） */
  legoPartNum: string;
  /** 商品标题等 */
  name: string;
  imgUrl: string | null;
  inventory: number;
};

/**
 * 高砖 `search?type=item` 多页聚合，供更换零件第一步选商品（不查本地零件库）。
 */
export async function fetchGobricksSearchItemHits(
  keywordRaw: string,
  init?: { signal?: AbortSignal }
): Promise<{ ok: true; hits: GobricksSearchItemHit[] } | { ok: false; error: string }> {
  const keyword = keywordRaw.trim().slice(0, 120);
  if (!keyword) return { ok: true, hits: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS * SHEET_REPLACE_SEARCH_MAX_PAGES);
  const signal = init?.signal;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      return { ok: false, error: "已取消。" };
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const headers = gobricksFrontendJsonHeaders(`https://gobricks.cn/search?keyword=${encodeURIComponent(keyword)}`);

  const bestByProduct = new Map<
    string,
    { inventory: number; row: Record<string, unknown>; legoPartNum: string }
  >();

  try {
    for (let page = 1; page <= SHEET_REPLACE_SEARCH_MAX_PAGES; page++) {
      const url = new URL(GOBRICKS_SEARCH_URL);
      url.searchParams.set("keyword", keyword);
      url.searchParams.set("type", "item");
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(SHEET_REPLACE_SEARCH_PAGE_SIZE));

      const res = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
        headers,
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          ok: false,
          error: `高砖搜索 HTTP ${res.status}：${text.trim().slice(0, 120) || "无详情"}`,
        };
      }
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        return { ok: false, error: "高砖搜索返回非 JSON。" };
      }
      if (typeof json !== "object" || json === null) {
        return { ok: false, error: "高砖搜索返回体异常。" };
      }
      const rows = asRecordArray((json as Record<string, unknown>).rows);
      if (rows.length === 0) break;

      for (const row of rows) {
        const productId = readProductIdFromSearchRow(row);
        if (!productId) continue;
        const legoPartNum = pickLegoPartNumForSearchHit(row, keyword);
        if (!legoPartNum) continue;
        const inv = numField(row.inventory);
        const prev = bestByProduct.get(productId);
        if (!prev || inv > prev.inventory) {
          bestByProduct.set(productId, { inventory: inv, row, legoPartNum });
        }
      }

      if (rows.length < SHEET_REPLACE_SEARCH_PAGE_SIZE) break;
      if (bestByProduct.size >= SHEET_REPLACE_SEARCH_MAX_HITS) break;
    }

    const hits: GobricksSearchItemHit[] = [];
    for (const [productId, { inventory, row, legoPartNum }] of bestByProduct) {
      const title = readSearchRowTitle(row);
      const name = title || `${legoPartNum} · 商品 ${productId}`;
      hits.push({
        productId,
        legoPartNum,
        name,
        imgUrl: readSearchRowPicture(row),
        inventory,
      });
    }
    hits.sort((a, b) => b.inventory - a.inventory || a.legoPartNum.localeCompare(b.legoPartNum));
    return { ok: true, hits: hits.slice(0, SHEET_REPLACE_SEARCH_MAX_HITS) };
  } catch (e) {
    const aborted = controller.signal.aborted;
    const msg =
      aborted && !signal?.aborted
        ? "请求高砖搜索超时。"
        : e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "请求高砖搜索失败。";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export type GobricksInStockColorRow = {
  /** 与 Rebrickable / 本地 colors.id 对齐的乐高色 ID 字符串 */
  legoColorId: string;
  inventory: number;
  gdsColorId: string;
  /** 高砖 SKU 商品图（按颜色分图） */
  picture: string | null;
  /** 高砖中文色名 */
  colorNameZh: string | null;
  colorNameEn: string | null;
  /** 色块 hex，可能带或不带 # */
  swatchHex: string | null;
};

function normalizeLegoColorIdFromColorData(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return null;
  const raw = (v as Record<string, unknown>).lego_color_id;
  const s =
    typeof raw === "string"
      ? raw.trim()
      : typeof raw === "number" && Number.isFinite(raw)
        ? String(Math.trunc(raw))
        : "";
  if (!s || s === "--") return null;
  return s;
}

function readGdsColorId(row: Record<string, unknown>): string {
  const raw = row.color_id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(Math.trunc(raw));
  return "";
}

function readPictureUrl(row: Record<string, unknown>): string | null {
  const p = row.picture;
  if (typeof p === "string" && p.trim().toLowerCase().startsWith("http")) return p.trim();
  return null;
}

function readColorDataExtra(cd: unknown): {
  zh: string | null;
  en: string | null;
  hex: string | null;
} {
  if (typeof cd !== "object" || cd === null) return { zh: null, en: null, hex: null };
  const o = cd as Record<string, unknown>;
  const zh = typeof o.name === "string" && o.name.trim() ? o.name.trim() : null;
  const en = typeof o.name_en === "string" && o.name_en.trim() ? o.name_en.trim() : null;
  const raw = typeof o.color === "string" ? o.color.trim() : "";
  const hex = raw ? raw.replace(/^#/, "") : null;
  return { zh, en, hex };
}

/**
 * 请求高砖 `item/filter`（`hasInventory=YES` 时有货 SKU）。公开接口，无需登录。
 */
export async function fetchGobricksItemFilterInStockColors(
  productId: string,
  init?: { signal?: AbortSignal; includeZeroInventory?: boolean }
): Promise<{ ok: true; rows: GobricksInStockColorRow[] } | { ok: false; error: string }> {
  const pid = productId.trim();
  if (!pid || !/^[\w.-]+$/.test(pid)) {
    return { ok: false, error: "高砖 product_id 无效。" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FILTER_TIMEOUT_MS);
  const signal = init?.signal;
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      return { ok: false, error: "已取消。" };
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const url = new URL(GOBRICKS_ITEM_FILTER_URL);
  url.searchParams.set("type", "2");
  url.searchParams.set("order_direction", "desc");
  url.searchParams.set("product_id", pid);
  url.searchParams.set("hasInventory", "YES");
  url.searchParams.set("limit", "200");

  const headers = gobricksFrontendJsonHeaders("https://gobricks.cn/batch");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
      headers,
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: `高砖库存接口 HTTP ${res.status}：${text.trim().slice(0, 120) || "无详情"}`,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "高砖库存接口返回非 JSON。" };
    }
    if (typeof json !== "object" || json === null) {
      return { ok: false, error: "高砖库存接口返回体异常。" };
    }
    const rowsRaw = (json as Record<string, unknown>).rows;
    const includeZero = init?.includeZeroInventory === true;
    const out: GobricksInStockColorRow[] = [];
    for (const row of asRecordArray(rowsRaw)) {
      const legoColorId = normalizeLegoColorIdFromColorData(row.color_data);
      if (!legoColorId) continue;
      const inv = numField(row.inventory);
      if (!Number.isFinite(inv) || inv < 0) continue;
      if (!includeZero && inv <= 0) continue;
      const gdsColorId = readGdsColorId(row);
      if (!gdsColorId) continue;
      const { zh, en, hex } = readColorDataExtra(row.color_data);
      out.push({
        legoColorId,
        inventory: Math.trunc(inv),
        gdsColorId,
        picture: readPictureUrl(row),
        colorNameZh: zh,
        colorNameEn: en,
        swatchHex: hex,
      });
    }
    return { ok: true, rows: out };
  } catch (e) {
    const aborted = controller.signal.aborted;
    const msg =
      aborted && !signal?.aborted
        ? "请求高砖库存超时。"
        : e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "请求高砖库存失败。";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}
