import {
  gobricksPartFallbackPicture,
  legoColorMatchedImgUrl,
  legoPartFallbackImgUrl,
  sheetRowGobricksThumbSrc,
} from "@/lib/parts-sheet-row-thumb";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

/** 机器可读 token：`‖sheetRowReplaced‖`（旧）或 `‖sheetRowReplaced:base64url(json)‖`（含原零件 p/c 与可选快照）。 */

const TOKEN_STRIP_RE = /‖sheetRowReplaced(?::[A-Za-z0-9_-]+)?‖/g;

/** 写入 JSON 的字符串最大长度（URL、名称、备注等） */
const SNAPSHOT_STR_MAX = 480;

function clipSnapshotStr(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > SNAPSHOT_STR_MAX ? t.slice(0, SNAPSHOT_STR_MAX) : t;
}

type EncodedPayload = {
  p: string;
  c: number;
  oi?: string;
  ogu?: string;
  ogi?: string;
  /** 原乐高零件名（Rebrickable） */
  oln?: string;
  /** 原乐高颜色名 */
  ocn?: string;
  /** 原高砖商品名 / 标题（中文） */
  ogx?: string;
  /** 原高砖商品名 / 标题（英文） */
  ogxe?: string;
  /** 原高砖中文色名 */
  ogcz?: string;
  /** 原高砖英文色名 */
  ogce?: string;
  /** 原高砖 color_id */
  ogc?: string;
  /** 原高砖接口乐高色 id */
  ogl?: string;
  /** 原高砖单价（元） */
  ogp?: string;
};

function snapshotToPayloadFields(snapshot: SheetRowReplaceSnapshot): Partial<EncodedPayload> {
  const o = clipSnapshotStr(snapshot.originalLegoImgUrl);
  const ogu = clipSnapshotStr(snapshot.originalGobricksPicture);
  const ogi = clipSnapshotStr(snapshot.originalGobricksItemId);
  const oln = clipSnapshotStr(snapshot.originalLegoPartName);
  const ocn = clipSnapshotStr(snapshot.originalColorName);
  const ogx = clipSnapshotStr(snapshot.originalGobricksCaption);
  const ogxe = clipSnapshotStr(snapshot.originalGobricksCaptionEn);
  const ogcz = clipSnapshotStr(snapshot.originalGobricksColorNameZh);
  const ogce = clipSnapshotStr(snapshot.originalGobricksColorNameEn);
  const ogc = clipSnapshotStr(snapshot.originalGobricksColorId);
  const ogl = clipSnapshotStr(snapshot.originalGobricksLegoColorId);
  const ogp = clipSnapshotStr(snapshot.originalGobricksUnitPrice);
  const out: Partial<EncodedPayload> = {};
  if (o) out.oi = o;
  if (ogu) out.ogu = ogu;
  if (ogi) out.ogi = ogi;
  if (oln) out.oln = oln;
  if (ocn) out.ocn = ocn;
  if (ogx) out.ogx = ogx;
  if (ogxe) out.ogxe = ogxe;
  if (ogcz) out.ogcz = ogcz;
  if (ogce) out.ogce = ogce;
  if (ogc) out.ogc = ogc;
  if (ogl) out.ogl = ogl;
  if (ogp) out.ogp = ogp;
  return out;
}

function encodeReplacePayload(original: { partNum: string; colorId: number }, snapshot: SheetRowReplaceSnapshot | null): string {
  const obj: EncodedPayload = {
    p: original.partNum.trim(),
    c: Math.trunc(original.colorId),
  };
  if (snapshot) Object.assign(obj, snapshotToPayloadFields(snapshot));
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeReplacePayload(payload: string): EncodedPayload | null {
  try {
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json) as EncodedPayload;
    if (typeof o.p !== "string" || !o.p.trim()) return null;
    const c = typeof o.c === "number" ? o.c : Number(o.c);
    if (!Number.isFinite(c)) return null;
    return {
      p: o.p.trim(),
      c: Math.trunc(c),
      oi: typeof o.oi === "string" && o.oi.trim() ? o.oi.trim() : undefined,
      ogu: typeof o.ogu === "string" && o.ogu.trim() ? o.ogu.trim() : undefined,
      ogi: typeof o.ogi === "string" && o.ogi.trim() ? o.ogi.trim() : undefined,
      oln: typeof o.oln === "string" && o.oln.trim() ? o.oln.trim() : undefined,
      ocn: typeof o.ocn === "string" && o.ocn.trim() ? o.ocn.trim() : undefined,
      ogx: typeof o.ogx === "string" && o.ogx.trim() ? o.ogx.trim() : undefined,
      ogxe: typeof o.ogxe === "string" && o.ogxe.trim() ? o.ogxe.trim() : undefined,
      ogcz: typeof o.ogcz === "string" && o.ogcz.trim() ? o.ogcz.trim() : undefined,
      ogce: typeof o.ogce === "string" && o.ogce.trim() ? o.ogce.trim() : undefined,
      ogc: typeof o.ogc === "string" && o.ogc.trim() ? o.ogc.trim() : undefined,
      ogl: typeof o.ogl === "string" && o.ogl.trim() ? o.ogl.trim() : undefined,
      ogp: typeof o.ogp === "string" && o.ogp.trim() ? o.ogp.trim() : undefined,
    };
  } catch {
    return null;
  }
}

export function restHasSheetRowReplacedMarker(rest: string): boolean {
  return rest.includes("‖sheetRowReplaced");
}

/** 有更换记录的配货行排在列表最前，其余保持相对顺序 */
export function sortFulfillmentItemsReplacedFirst<T extends { rest: string }>(
  items: readonly T[],
): T[] {
  const modified: T[] = [];
  const rest: T[] = [];
  for (const row of items) {
    if (restHasSheetRowReplacedMarker(row.rest)) modified.push(row);
    else rest.push(row);
  }
  return [...modified, ...rest];
}

/** 配货表展示用：含更换行，且更换行置顶（保留原 lineNumber 供更换/还原定位） */
export function fulfillmentItemsForDisplay<T extends { rest: string }>(
  items: readonly T[],
): T[] {
  return sortFulfillmentItemsReplacedFirst(items);
}

export function stripSheetRowReplacedMarker(rest: string): string {
  return rest.replace(TOKEN_STRIP_RE, "").replace(/\s{2,}/g, " ").trim();
}

export type SheetRowReplaceSnapshot = {
  originalLegoImgUrl: string | null;
  originalGobricksPicture: string | null;
  originalGobricksItemId: string | null;
  originalLegoPartName: string | null;
  originalColorName: string | null;
  originalGobricksCaption: string | null;
  originalGobricksCaptionEn: string | null;
  originalGobricksColorNameZh: string | null;
  originalGobricksColorNameEn: string | null;
  originalGobricksColorId: string | null;
  originalGobricksLegoColorId: string | null;
  originalGobricksUnitPrice: string | null;
};

export type ParsedSheetRowReplaceMeta = {
  hasMarker: boolean;
  originalPartNum: string | null;
  originalColorId: number | null;
  originalLegoImgUrl: string | null;
  originalGobricksPicture: string | null;
  originalGobricksItemId: string | null;
  originalLegoPartName: string | null;
  originalColorName: string | null;
  originalGobricksCaption: string | null;
  originalGobricksCaptionEn: string | null;
  originalGobricksColorNameZh: string | null;
  originalGobricksColorNameEn: string | null;
  originalGobricksColorId: string | null;
  originalGobricksLegoColorId: string | null;
  originalGobricksUnitPrice: string | null;
};

function payloadToParsed(d: EncodedPayload): ParsedSheetRowReplaceMeta {
  return {
    hasMarker: true,
    originalPartNum: d.p,
    originalColorId: d.c,
    originalLegoImgUrl: d.oi ?? null,
    originalGobricksPicture: d.ogu ?? null,
    originalGobricksItemId: d.ogi ?? null,
    originalLegoPartName: d.oln ?? null,
    originalColorName: d.ocn ?? null,
    originalGobricksCaption: d.ogx ?? null,
    originalGobricksCaptionEn: d.ogxe ?? null,
    originalGobricksColorNameZh: d.ogcz ?? null,
    originalGobricksColorNameEn: d.ogce ?? null,
    originalGobricksColorId: d.ogc ?? null,
    originalGobricksLegoColorId: d.ogl ?? null,
    originalGobricksUnitPrice: d.ogp ?? null,
  };
}

export function parseSheetRowReplaceMeta(rest: string): ParsedSheetRowReplaceMeta {
  const empty: ParsedSheetRowReplaceMeta = {
    hasMarker: false,
    originalPartNum: null,
    originalColorId: null,
    originalLegoImgUrl: null,
    originalGobricksPicture: null,
    originalGobricksItemId: null,
    originalLegoPartName: null,
    originalColorName: null,
    originalGobricksCaption: null,
    originalGobricksCaptionEn: null,
    originalGobricksColorNameZh: null,
    originalGobricksColorNameEn: null,
    originalGobricksColorId: null,
    originalGobricksLegoColorId: null,
    originalGobricksUnitPrice: null,
  };
  const enc = rest.match(/‖sheetRowReplaced:([A-Za-z0-9_-]+)‖/);
  if (enc?.[1]) {
    const d = decodeReplacePayload(enc[1]);
    if (d) return payloadToParsed(d);
    return {
      ...empty,
      hasMarker: true,
    };
  }
  if (rest.includes("‖sheetRowReplaced‖")) {
    return { ...empty, hasMarker: true };
  }
  return empty;
}

function snapshotHasAnyData(s: SheetRowReplaceSnapshot): boolean {
  return Boolean(
    s.originalLegoImgUrl ||
      s.originalGobricksPicture ||
      s.originalGobricksItemId ||
      s.originalLegoPartName ||
      s.originalColorName ||
      s.originalGobricksCaption ||
      s.originalGobricksCaptionEn ||
      s.originalGobricksColorNameZh ||
      s.originalGobricksColorNameEn ||
      s.originalGobricksColorId ||
      s.originalGobricksLegoColorId ||
      s.originalGobricksUnitPrice
  );
}

/** 从解析行写入 token 的快照（首次更换时用当前行数据）。 */
export type RowSnapshotSource = {
  imgUrl?: string | null;
  gdsPicture?: string | null;
  gdsItemId?: string | null;
  partName?: string | null;
  colorName?: string | null;
  gdsCaption?: string | null;
  gdsCaptionEn?: string | null;
  gdsColorNameZh?: string | null;
  gdsColorNameEn?: string | null;
  gdsColorId?: string | null;
  gdsLegoColorId?: string | null;
  gdsUnitPrice?: string | null;
  gobricksUnitPrice?: string | null;
};

export function buildSheetRowReplaceSnapshotFromRow(row: RowSnapshotSource): SheetRowReplaceSnapshot | null {
  const unit = (row.gdsUnitPrice ?? row.gobricksUnitPrice ?? "").trim() || null;
  const colorRow = row as ShortageResolveItem;
  const s: SheetRowReplaceSnapshot = {
    originalLegoImgUrl: clipSnapshotStr(
      legoColorMatchedImgUrl(colorRow) ?? legoPartFallbackImgUrl(colorRow)
    ),
    originalGobricksPicture: clipSnapshotStr(
      sheetRowGobricksThumbSrc(colorRow) ?? gobricksPartFallbackPicture(colorRow)
    ),
    originalGobricksItemId: clipSnapshotStr(row.gdsItemId ?? null),
    originalLegoPartName: clipSnapshotStr(row.partName ?? null),
    originalColorName: clipSnapshotStr(row.colorName ?? null),
    originalGobricksCaption: clipSnapshotStr(row.gdsCaption ?? null),
    originalGobricksCaptionEn: clipSnapshotStr(row.gdsCaptionEn ?? null),
    originalGobricksColorNameZh: clipSnapshotStr(row.gdsColorNameZh ?? null),
    originalGobricksColorNameEn: clipSnapshotStr(row.gdsColorNameEn ?? null),
    originalGobricksColorId: clipSnapshotStr(row.gdsColorId ?? null),
    originalGobricksLegoColorId: clipSnapshotStr(row.gdsLegoColorId ?? null),
    originalGobricksUnitPrice: clipSnapshotStr(unit),
  };
  return snapshotHasAnyData(s) ? s : null;
}

/** 嵌套更换时从旧 token 解析出的快照原样保留（勿用当前行冒充「原」）。 */
function snapshotFromParsedReplaceMeta(m: ParsedSheetRowReplaceMeta): SheetRowReplaceSnapshot | null {
  if (!m.hasMarker) return null;
  const s: SheetRowReplaceSnapshot = {
    originalLegoImgUrl: m.originalLegoImgUrl,
    originalGobricksPicture: m.originalGobricksPicture,
    originalGobricksItemId: m.originalGobricksItemId,
    originalLegoPartName: m.originalLegoPartName,
    originalColorName: m.originalColorName,
    originalGobricksCaption: m.originalGobricksCaption,
    originalGobricksCaptionEn: m.originalGobricksCaptionEn,
    originalGobricksColorNameZh: m.originalGobricksColorNameZh,
    originalGobricksColorNameEn: m.originalGobricksColorNameEn,
    originalGobricksColorId: m.originalGobricksColorId,
    originalGobricksLegoColorId: m.originalGobricksLegoColorId,
    originalGobricksUnitPrice: m.originalGobricksUnitPrice,
  };
  return snapshotHasAnyData(s) ? s : null;
}

/**
 * 持久化更换标记时携带的快照：嵌套更换时保留 token 内已有快照。
 */
export function mergeSheetRowReplaceSnapshotForPersist(
  oldMeta: ParsedSheetRowReplaceMeta,
  oldRow: RowSnapshotSource,
): SheetRowReplaceSnapshot | null {
  const nested =
    oldMeta.hasMarker && oldMeta.originalPartNum != null && oldMeta.originalColorId != null;
  if (nested) {
    return snapshotFromParsedReplaceMeta(oldMeta);
  }
  return buildSheetRowReplaceSnapshotFromRow(oldRow);
}

export function appendSheetRowReplacedMarker(
  rest: string,
  original: { partNum: string; colorId: number },
  snapshot?: SheetRowReplaceSnapshot | null,
): string {
  const base = stripSheetRowReplacedMarker(rest);
  const snap = snapshot && snapshotHasAnyData(snapshot) ? snapshot : null;
  const token = `‖sheetRowReplaced:${encodeReplacePayload(original, snap)}‖`;
  const b = base.trim();
  return b ? `${b} ${token}` : token;
}
