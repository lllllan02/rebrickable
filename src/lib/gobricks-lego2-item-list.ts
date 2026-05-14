import { serializeShortageCsv } from "@/lib/serialize-shortage-csv";

export const GOBRICKS_LEGO2_ITEM_LIST_URL =
  "https://gobricks.cn/frontend/v1/community/lego2ItemList";

export type GobricksTestListItem = {
  designid: string;
  quantity: number;
  colorid: string;
  color_type: "ldr";
};

type GobricksInfo = {
  inventory?: string | number;
  buy_limit?: string | number;
  price?: string | number;
  eshop_price?: string | number;
};

function numField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function readDesignColorQty(row: Record<string, unknown>): {
  designid: string;
  colorid: string;
  quantity: number;
} | null {
  const designid = typeof row.designid === "string" ? row.designid.trim() : "";
  const colorid = typeof row.colorid === "string" ? row.colorid.trim() : "";
  const q = numField(row.quantity);
  if (!designid || !colorid || !Number.isFinite(q) || q <= 0) return null;
  return { designid, colorid, quantity: Math.trunc(q) };
}

function parseColorId(colorid: string): number | null {
  const n = Number(colorid);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

export function aggregateBomForGobricks(
  items: readonly { partNum: string; colorId: number; quantity: number }[]
): { partNum: string; colorId: number; quantity: number }[] {
  const m = new Map<string, { partNum: string; colorId: number; quantity: number }>();
  for (const it of items) {
    const partNum = String(it.partNum ?? "").trim();
    const colorId = Math.trunc(Number(it.colorId));
    const q = Math.trunc(Number(it.quantity));
    if (!partNum || !Number.isFinite(colorId) || colorId < 0 || !Number.isFinite(q) || q <= 0) {
      continue;
    }
    const k = `${partNum}\t${colorId}`;
    const prev = m.get(k);
    if (prev) prev.quantity += q;
    else m.set(k, { partNum, colorId, quantity: q });
  }
  return [...m.values()];
}

export function bomToGobricksTestList(
  items: readonly { partNum: string; colorId: number; quantity: number }[]
): GobricksTestListItem[] {
  return aggregateBomForGobricks(items).map((r) => ({
    designid: r.partNum,
    quantity: r.quantity,
    colorid: String(r.colorId),
    color_type: "ldr",
  }));
}

type AccRow = { quantity: number; rests: string[]; unitPrice: string | null };

function gobricksUnitPriceFromRow(row: Record<string, unknown>): string | null {
  const info = infoFromRow(row);
  if (!info) return null;
  const raw = info.price ?? info.eshop_price;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

function bump(
  acc: Map<string, AccRow>,
  partNum: string,
  colorId: number,
  qty: number,
  rest: string,
  unitPrice: string | null
): void {
  if (!Number.isFinite(qty) || qty <= 0) return;
  const k = `${partNum}\t${colorId}`;
  const prev = acc.get(k);
  if (prev) {
    prev.quantity += qty;
    prev.rests.push(rest);
    if (!prev.unitPrice && unitPrice) prev.unitPrice = unitPrice;
  } else {
    acc.set(k, { quantity: qty, rests: [rest], unitPrice: unitPrice ?? null });
  }
}

function asRecordArray(v: unknown): Record<string, unknown>[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
}

function pickGobricksSurfaceMessage(j: Record<string, unknown>): string {
  for (const k of ["message", "msg", "errorMessage", "errMsg", "error"]) {
    const v = j[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * 高砖 `lego2ItemList` 在 HTTP 200 时仍可能返回业务失败或 quantityErrorList。
 * 若不抛出，缺件解析会得到空表，表现为「已检查但永远无缺件」。
 */
export function assertGobricksLego2ItemListPayloadOk(payload: unknown): void {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("高砖接口返回体不是 JSON 对象");
  }
  const j = payload as Record<string, unknown>;
  if (j.ok === false) {
    const msg = pickGobricksSurfaceMessage(j) || "接口报告失败";
    throw new Error(`高砖：${msg}`);
  }
  if (typeof j.success === "boolean" && j.success === false) {
    const msg = pickGobricksSurfaceMessage(j) || "请求未成功";
    throw new Error(`高砖：${msg}`);
  }
  const code = j.code;
  if (typeof code === "number" && code !== 0 && code !== 200) {
    const msg = pickGobricksSurfaceMessage(j) || `错误码 ${code}`;
    throw new Error(`高砖（${code}）：${msg}`);
  }
  const qel = j.quantityErrorList;
  if (Array.isArray(qel) && qel.length > 0) {
    const bits = qel.slice(0, 3).map((row, i) => {
      if (typeof row !== "object" || row === null) return `#${i + 1}`;
      const r = row as Record<string, unknown>;
      const d = typeof r.designid === "string" ? r.designid : "";
      const msg =
        typeof r.message === "string"
          ? r.message
          : typeof r.msg === "string"
            ? r.msg
            : typeof r.error === "string"
              ? r.error
              : "";
      return [d, msg].filter(Boolean).join(" ");
    });
    throw new Error(
      `高砖 quantityErrorList（${qel.length} 条）：${bits.filter(Boolean).join("；") || "请检查零件编号与颜色"}`
    );
  }
  if (!("missList" in j) && !("itemList" in j)) {
    const keys = Object.keys(j).slice(0, 14).join(", ");
    throw new Error(`高砖：返回缺少 itemList / missList（字段：${keys || "无"}）`);
  }
}

function infoFromRow(row: Record<string, unknown>): GobricksInfo | null {
  const info = row.info;
  if (typeof info !== "object" || info === null) return null;
  return info as GobricksInfo;
}

/**
 * 将高砖 `lego2ItemList` 的 `itemList` 转为配货表 CSV 行（与 {@link parseShortageCsv} 兼容；含 `info.price` 单价列）。
 * 表示上传完整 BOM 后高砖商城侧可配货（有对应商品）的行。
 */
export function fulfillmentSerializeRowsFromGobricksPayload(payload: unknown): {
  rows: {
    partNum: string;
    colorId: number;
    quantity: number;
    rest: string;
    gobricksUnitPrice: string | null;
  }[];
} {
  if (typeof payload !== "object" || payload === null) {
    return { rows: [] };
  }
  const p = payload as Record<string, unknown>;
  const acc = new Map<string, AccRow>();

  for (const row of asRecordArray(p.itemList)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    bump(acc, base.designid, cid, base.quantity, "高砖商城有货", gobricksUnitPriceFromRow(row));
  }

  const rows = [...acc.entries()].map(([k, v]) => {
    const tab = k.indexOf("\t");
    const partNum = tab >= 0 ? k.slice(0, tab) : k;
    const colorId = tab >= 0 ? Number(k.slice(tab + 1)) : 0;
    const uniqRest = [...new Set(v.rests)];
    const rest = uniqRest.join("·");
    return {
      partNum,
      colorId,
      quantity: v.quantity,
      rest,
      gobricksUnitPrice: v.unitPrice,
    };
  });

  rows.sort((a, b) =>
    a.partNum !== b.partNum
      ? a.partNum.localeCompare(b.partNum)
      : a.colorId !== b.colorId
        ? a.colorId - b.colorId
        : b.quantity - a.quantity
  );

  return { rows };
}

export function fulfillmentCsvFromGobricksPayload(payload: unknown): string {
  const { rows } = fulfillmentSerializeRowsFromGobricksPayload(payload);
  return serializeShortageCsv(rows, { includeHeader: true });
}

/**
 * 将高砖 `lego2ItemList` 的若干列表合并为缺件 CSV 行（与 {@link parseShortageCsv} 兼容；含 `info.price` 单价列）。
 * `missList` 等为高砖无法按需求完全满足的部分；与 {@link fulfillmentSerializeRowsFromGobricksPayload} 的 `itemList` 分列存储。
 */
export function shortageSerializeRowsFromGobricksPayload(payload: unknown): {
  rows: {
    partNum: string;
    colorId: number;
    quantity: number;
    rest: string;
    gobricksUnitPrice: string | null;
  }[];
} {
  if (typeof payload !== "object" || payload === null) {
    return { rows: [] };
  }
  const p = payload as Record<string, unknown>;
  const acc = new Map<string, AccRow>();

  for (const row of asRecordArray(p.missList)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    bump(acc, base.designid, cid, base.quantity, "零件未匹配", null);
  }

  for (const row of asRecordArray(p.noSellList)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    bump(acc, base.designid, cid, base.quantity, "下架", gobricksUnitPriceFromRow(row));
  }

  for (const row of asRecordArray(p.colorDeficiency)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    bump(acc, base.designid, cid, base.quantity, "颜色未匹配", gobricksUnitPriceFromRow(row));
  }

  for (const row of asRecordArray(p.inventoryDeficiency)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    const info = infoFromRow(row);
    const inv = numField(info?.inventory);
    const shortQty = Math.max(0, base.quantity - inv);
    if (shortQty <= 0) continue;
    bump(acc, base.designid, cid, shortQty, "库存不足", gobricksUnitPriceFromRow(row));
  }

  for (const row of asRecordArray(p.buyLimitList)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    const info = infoFromRow(row);
    const limit = numField(info?.buy_limit);
    const price = gobricksUnitPriceFromRow(row);
    if (!Number.isFinite(limit) || limit <= 0) {
      bump(acc, base.designid, cid, base.quantity, "超限购", price);
      continue;
    }
    const over = Math.max(0, base.quantity - limit);
    if (over <= 0) continue;
    bump(acc, base.designid, cid, over, `超限购·${Math.trunc(limit)}`, price);
  }

  const rows = [...acc.entries()].map(([k, v]) => {
    const tab = k.indexOf("\t");
    const partNum = tab >= 0 ? k.slice(0, tab) : k;
    const colorId = tab >= 0 ? Number(k.slice(tab + 1)) : 0;
    const uniqRest = [...new Set(v.rests)];
    const rest = uniqRest.join("·");
    return {
      partNum,
      colorId,
      quantity: v.quantity,
      rest,
      gobricksUnitPrice: v.unitPrice,
    };
  });

  rows.sort((a, b) =>
    a.partNum !== b.partNum
      ? a.partNum.localeCompare(b.partNum)
      : a.colorId !== b.colorId
        ? a.colorId - b.colorId
        : b.quantity - a.quantity
  );

  return { rows };
}

export function shortageCsvFromGobricksPayload(payload: unknown): string {
  const { rows } = shortageSerializeRowsFromGobricksPayload(payload);
  return serializeShortageCsv(rows, { includeHeader: true });
}

export async function fetchGobricksLego2ItemListJson(
  testList: GobricksTestListItem[],
  init?: RequestInit
): Promise<unknown> {
  const res = await fetch(GOBRICKS_LEGO2_ITEM_LIST_URL, {
    method: "POST",
    signal: init?.signal,
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json;charset=UTF-8",
      Origin: "https://gobricks.cn",
      Referer: "https://gobricks.cn/batch",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      platform: "pc",
    },
    body: JSON.stringify({ testList }),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const m = pickGobricksSurfaceMessage(j);
      if (m) detail = `${detail}：${m}`;
    } catch {
      const snippet = text.trim().slice(0, 160);
      if (snippet) detail = `${detail}：${snippet}`;
    }
    throw new Error(`高砖接口 ${detail}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new Error("高砖接口返回非 JSON");
  }
  assertGobricksLego2ItemListPayloadOk(json);
  return json;
}

const DEFAULT_CHUNK = 400;

function gdsPriceFromLego2RootPayload(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) return 0;
  const raw = (payload as Record<string, unknown>).gdsPrice;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return 0;
}

/** 读取 {@link fetchGobricksLego2MergedPayload} 返回体上的 `gdsPriceCny`（各分片根字段 `gdsPrice` 之和）。 */
export function readGdsPriceCnyFromMergedGobricksPayload(payload: unknown): number {
  if (typeof payload !== "object" || payload === null) return 0;
  const v = (payload as Record<string, unknown>).gdsPriceCny;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  return 0;
}

export async function fetchGobricksLego2MergedPayload(
  testList: GobricksTestListItem[],
  opts?: { chunkSize?: number; signal?: AbortSignal }
): Promise<unknown> {
  const chunkSize = opts?.chunkSize ?? DEFAULT_CHUNK;
  const signal = opts?.signal;
  if (testList.length === 0) {
    return {
      missList: [],
      itemList: [],
      inventoryDeficiency: [],
      colorDeficiency: [],
      buyLimitList: [],
      noSellList: [],
      gdsPriceCny: 0,
    };
  }

  const merged: Record<string, unknown[]> = {
    missList: [],
    itemList: [],
    inventoryDeficiency: [],
    colorDeficiency: [],
    buyLimitList: [],
    noSellList: [],
  };

  let gdsPriceCny = 0;
  for (let i = 0; i < testList.length; i += chunkSize) {
    const chunk = testList.slice(i, i + chunkSize);
    const payload = await fetchGobricksLego2ItemListJson(chunk, { signal });
    if (typeof payload !== "object" || payload === null) continue;
    const p = payload as Record<string, unknown>;
    gdsPriceCny += gdsPriceFromLego2RootPayload(payload);
    for (const key of Object.keys(merged) as (keyof typeof merged)[]) {
      merged[key].push(...asRecordArray(p[key]));
    }
  }

  return {
    missList: merged.missList,
    itemList: merged.itemList,
    inventoryDeficiency: merged.inventoryDeficiency,
    colorDeficiency: merged.colorDeficiency,
    buyLimitList: merged.buyLimitList,
    noSellList: merged.noSellList,
    gdsPriceCny,
  };
}
