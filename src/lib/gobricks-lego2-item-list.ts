import type { GobricksSheetSerializedRow } from "@/lib/gobricks-sheet-serialized-row";
import { readColorNamesFromLego2ApiRow } from "@/lib/gobricks-color-data";
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
  id?: string | number;
  inventory?: string | number;
  buy_limit?: string | number;
  price?: string | number;
  eshop_price?: string | number;
  picture?: string;
  caption?: string;
  caption_en?: string;
  shelf_state?: string;
  lego_color_id?: string | number;
  color_id?: string | number;
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

export type { GobricksSheetSerializedRow } from "@/lib/gobricks-sheet-serialized-row";

type GdsSnapshot = {
  gdsItemId: string | null;
  gdsColorId: string | null;
  gdsPicture: string | null;
  gdsUnitPrice: string | null;
  gdsCaption: string | null;
  gdsCaptionEn: string | null;
  gdsShelfState: string | null;
  gdsLegoColorId: string | null;
  gdsColorNameZh: string | null;
  gdsColorNameEn: string | null;
};

function emptyGdsSnapshot(): GdsSnapshot {
  return {
    gdsItemId: null,
    gdsColorId: null,
    gdsPicture: null,
    gdsUnitPrice: null,
    gdsCaption: null,
    gdsCaptionEn: null,
    gdsShelfState: null,
    gdsLegoColorId: null,
    gdsColorNameZh: null,
    gdsColorNameEn: null,
  };
}

function gdsSnapshotFromApiRow(
  row: Record<string, unknown>,
  base: { designid: string; colorid: string }
): GdsSnapshot {
  const s = emptyGdsSnapshot();
  const itemRow =
    typeof row.item_id === "string" && row.item_id.trim() ? row.item_id.trim() : null;
  const info = infoFromRow(row);
  const ir = info as Record<string, unknown> | null;
  const idRaw = ir?.id;
  const itemInfo =
    typeof idRaw === "string" && idRaw.trim()
      ? idRaw.trim()
      : typeof idRaw === "number" && Number.isFinite(idRaw)
        ? String(Math.trunc(idRaw))
        : null;
  s.gdsItemId = itemRow ?? itemInfo;
  const colorFromInfo = ir
    ? typeof ir.color_id === "string" && ir.color_id.trim()
      ? ir.color_id.trim()
      : typeof ir.color_id === "number" && Number.isFinite(ir.color_id)
        ? String(Math.trunc(ir.color_id))
        : null
    : null;
  s.gdsColorId = base.colorid.trim() || colorFromInfo;
  if (ir) {
    if (typeof ir.picture === "string" && ir.picture.trim()) s.gdsPicture = ir.picture.trim();
    if (typeof ir.caption === "string" && ir.caption.trim()) s.gdsCaption = ir.caption.trim();
    if (typeof ir.caption_en === "string" && ir.caption_en.trim()) s.gdsCaptionEn = ir.caption_en.trim();
    if (typeof ir.shelf_state === "string" && ir.shelf_state.trim()) s.gdsShelfState = ir.shelf_state.trim();
    if (typeof ir.lego_color_id === "string" && ir.lego_color_id.trim()) s.gdsLegoColorId = ir.lego_color_id.trim();
    else if (typeof ir.lego_color_id === "number" && Number.isFinite(ir.lego_color_id)) {
      s.gdsLegoColorId = String(Math.trunc(ir.lego_color_id));
    }
  }
  s.gdsUnitPrice = gobricksUnitPriceFromRow(row);
  const colorNames = readColorNamesFromLego2ApiRow(row);
  s.gdsColorNameZh = colorNames.zh;
  s.gdsColorNameEn = colorNames.en;
  return s;
}

type AccRow = {
  quantity: number;
  rests: string[];
  unitPrice: string | null;
  /** 聚合首行的高砖展示字段；后续并入同键行不覆盖 */
  gds: GdsSnapshot;
};

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
  row: Record<string, unknown>,
  base: { designid: string; colorid: string }
): void {
  if (!Number.isFinite(qty) || qty <= 0) return;
  const unitPrice = gobricksUnitPriceFromRow(row);
  const k = `${partNum}\t${colorId}`;
  const prev = acc.get(k);
  if (prev) {
    prev.quantity += qty;
    prev.rests.push(rest);
    if (!prev.unitPrice && unitPrice) prev.unitPrice = unitPrice;
    const incoming = gdsSnapshotFromApiRow(row, base);
    if (!prev.gds.gdsColorNameZh && incoming.gdsColorNameZh) prev.gds.gdsColorNameZh = incoming.gdsColorNameZh;
    if (!prev.gds.gdsColorNameEn && incoming.gdsColorNameEn) prev.gds.gdsColorNameEn = incoming.gdsColorNameEn;
  } else {
    acc.set(k, {
      quantity: qty,
      rests: [rest],
      unitPrice: unitPrice ?? null,
      gds: gdsSnapshotFromApiRow(row, base),
    });
  }
}

function accRowToSerializedRow(
  partNum: string,
  colorId: number,
  v: AccRow
): GobricksSheetSerializedRow {
  const g = v.gds;
  const price = v.unitPrice ?? g.gdsUnitPrice;
  return {
    partNum,
    colorId,
    quantity: v.quantity,
    rest: [...new Set(v.rests)].join("·"),
    gobricksUnitPrice: price,
    gdsItemId: g.gdsItemId,
    gdsColorId: g.gdsColorId,
    gdsPicture: g.gdsPicture,
    gdsUnitPrice: g.gdsUnitPrice ?? price,
    gdsCaption: g.gdsCaption,
    gdsCaptionEn: g.gdsCaptionEn,
    gdsShelfState: g.gdsShelfState,
    gdsLegoColorId: g.gdsLegoColorId,
    gdsColorNameZh: g.gdsColorNameZh,
    gdsColorNameEn: g.gdsColorNameEn,
  };
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
 * 将高砖 `lego2ItemList` 的 `itemList` 转为配货表行（含 `gds_*` 与兼容字段 `gobricksUnitPrice`）。
 * 表示上传完整 BOM 后高砖商城侧可配货（有对应商品）的行；`rest` 留空（有货无需备注）。
 */
export function fulfillmentSerializeRowsFromGobricksPayload(payload: unknown): {
  rows: GobricksSheetSerializedRow[];
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
    bump(acc, base.designid, cid, base.quantity, "", row, base);
  }

  const rows = [...acc.entries()].map(([k, v]) => {
    const tab = k.indexOf("\t");
    const partNum = tab >= 0 ? k.slice(0, tab) : k;
    const colorId = tab >= 0 ? Number(k.slice(tab + 1)) : 0;
    return accRowToSerializedRow(partNum, colorId, v);
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
 * 将高砖 `lego2ItemList` 的若干列表合并为缺件行（含 `gds_*`）。
 * `missList` 等为高砖无法按需求完全满足的部分；与 {@link fulfillmentSerializeRowsFromGobricksPayload} 的 `itemList` 分列存储。
 */
export function shortageSerializeRowsFromGobricksPayload(payload: unknown): {
  rows: GobricksSheetSerializedRow[];
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
    bump(acc, base.designid, cid, base.quantity, "零件未匹配", row, base);
  }

  for (const row of asRecordArray(p.noSellList)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    bump(acc, base.designid, cid, base.quantity, "下架", row, base);
  }

  for (const row of asRecordArray(p.colorDeficiency)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    bump(acc, base.designid, cid, base.quantity, "颜色未匹配", row, base);
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
    bump(acc, base.designid, cid, shortQty, "库存不足", row, base);
  }

  for (const row of asRecordArray(p.buyLimitList)) {
    const base = readDesignColorQty(row);
    if (!base) continue;
    const cid = parseColorId(base.colorid);
    if (cid === null) continue;
    const info = infoFromRow(row);
    const limit = numField(info?.buy_limit);
    if (!Number.isFinite(limit) || limit <= 0) {
      bump(acc, base.designid, cid, base.quantity, "超限购", row, base);
      continue;
    }
    const over = Math.max(0, base.quantity - limit);
    if (over <= 0) continue;
    bump(acc, base.designid, cid, over, `超限购·${Math.trunc(limit)}`, row, base);
  }

  const rows = [...acc.entries()].map(([k, v]) => {
    const tab = k.indexOf("\t");
    const partNum = tab >= 0 ? k.slice(0, tab) : k;
    const colorId = tab >= 0 ? Number(k.slice(tab + 1)) : 0;
    return accRowToSerializedRow(partNum, colorId, v);
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
