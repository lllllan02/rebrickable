/** 机器可读 token：`‖sheetRowReplaced‖`（旧）或 `‖sheetRowReplaced:base64url(json)‖`（含原零件 p / 色 c）。 */

const TOKEN_STRIP_RE = /‖sheetRowReplaced(?::[A-Za-z0-9_-]+)?‖/g;

function encodeReplacePayload(partNum: string, colorId: number): string {
  const json = JSON.stringify({ p: partNum.trim(), c: Math.trunc(colorId) });
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeReplacePayload(payload: string): { p: string; c: number } | null {
  try {
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json) as { p?: unknown; c?: unknown };
    if (typeof o.p !== "string" || !o.p.trim()) return null;
    const c = typeof o.c === "number" ? o.c : Number(o.c);
    if (!Number.isFinite(c)) return null;
    return { p: o.p.trim(), c: Math.trunc(c) };
  } catch {
    return null;
  }
}

export function restHasSheetRowReplacedMarker(rest: string): boolean {
  return rest.includes("‖sheetRowReplaced");
}

export function stripSheetRowReplacedMarker(rest: string): string {
  return rest.replace(TOKEN_STRIP_RE, "").replace(/\s{2,}/g, " ").trim();
}

export function parseSheetRowReplaceMeta(rest: string): {
  hasMarker: boolean;
  originalPartNum: string | null;
  originalColorId: number | null;
} {
  const enc = rest.match(/‖sheetRowReplaced:([A-Za-z0-9_-]+)‖/);
  if (enc?.[1]) {
    const d = decodeReplacePayload(enc[1]);
    if (d) return { hasMarker: true, originalPartNum: d.p, originalColorId: d.c };
    return { hasMarker: true, originalPartNum: null, originalColorId: null };
  }
  if (rest.includes("‖sheetRowReplaced‖")) {
    return { hasMarker: true, originalPartNum: null, originalColorId: null };
  }
  return { hasMarker: false, originalPartNum: null, originalColorId: null };
}

export function appendSheetRowReplacedMarker(
  rest: string,
  original: { partNum: string; colorId: number }
): string {
  const base = stripSheetRowReplacedMarker(rest);
  const token = `‖sheetRowReplaced:${encodeReplacePayload(original.partNum, original.colorId)}‖`;
  const b = base.trim();
  return b ? `${b} ${token}` : token;
}
