import type { PartsSheetXlsxRow } from "@/lib/build-parts-sheet-xlsx";

export const MAX_EXPORT_ROWS = 2500;
export const MAX_EXPORT_JSON_BYTES = 4_000_000;

function isImgSource(v: unknown): v is PartsSheetXlsxRow["imgSource"] {
  return v === null || v === "color" || v === "part";
}

export function parseExportItems(data: unknown): PartsSheetXlsxRow[] | null {
  if (typeof data !== "object" || data === null || !("items" in data)) return null;
  const items = (data as { items: unknown }).items;
  if (!Array.isArray(items)) return null;
  const out: PartsSheetXlsxRow[] = [];
  for (const it of items) {
    if (typeof it !== "object" || it === null) return null;
    const o = it as Record<string, unknown>;
    if (
      typeof o.lineNumber !== "number" ||
      typeof o.partNum !== "string" ||
      typeof o.colorId !== "number" ||
      typeof o.quantity !== "number" ||
      typeof o.rest !== "string" ||
      typeof o.partFound !== "boolean" ||
      (o.partName !== null && typeof o.partName !== "string") ||
      (o.colorName !== null && typeof o.colorName !== "string") ||
      typeof o.elementKnown !== "boolean" ||
      (o.imgUrl !== null && typeof o.imgUrl !== "string") ||
      !isImgSource(o.imgSource)
    ) {
      return null;
    }
    out.push({
      lineNumber: o.lineNumber,
      partNum: o.partNum,
      colorId: o.colorId,
      quantity: o.quantity,
      rest: o.rest,
      partFound: o.partFound,
      partName: o.partName as string | null,
      colorName: o.colorName as string | null,
      elementKnown: o.elementKnown,
      imgUrl: o.imgUrl as string | null,
      imgSource: o.imgSource,
    });
  }
  return out;
}

export function parseExportFilenameStem(body: unknown): string {
  let stem = "parts-sheet-edited";
  if (
    typeof body === "object" &&
    body !== null &&
    "filenameStem" in body &&
    typeof (body as { filenameStem: unknown }).filenameStem === "string"
  ) {
    const s = (body as { filenameStem: string }).filenameStem.trim().slice(0, 120);
    if (s) stem = s.replace(/[/\\?%*:|"<>]/g, "-");
  }
  return stem;
}

export async function readExportJsonBody(req: Request): Promise<
  | { ok: true; body: unknown }
  | { ok: false; status: number; error: string }
> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, status: 400, error: "无法读取请求体。" };
  }
  if (raw.length > MAX_EXPORT_JSON_BYTES) {
    return {
      ok: false,
      status: 400,
      error: `请求体过大（上限 ${MAX_EXPORT_JSON_BYTES} 字节）。`,
    };
  }
  try {
    return { ok: true, body: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, status: 400, error: "请求体须为 JSON。" };
  }
}
