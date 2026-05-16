import type { PartsSheetXlsxRow } from "@/lib/build-parts-sheet-xlsx";
import { MAX_PARTS_SHEET_EXPORT_STEM_LEN } from "@/lib/parts-sheet-export-filename";
import type { PartsSheetTag } from "@/lib/parts-sheet-tags";

export const MAX_EXPORT_ROWS = 2500;
export const MAX_EXPORT_JSON_BYTES = 4_000_000;

function isImgSource(v: unknown): v is PartsSheetXlsxRow["imgSource"] {
  return v === null || v === "color" || v === "part";
}

const SHEET_TAG_SET = new Set<PartsSheetTag>(["printed", "minifig", "sticker"]);

function isSheetTag(v: unknown): v is PartsSheetTag {
  return typeof v === "string" && SHEET_TAG_SET.has(v as PartsSheetTag);
}

function isOptionalExportString(v: unknown): boolean {
  return v === undefined || v === null || typeof v === "string";
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
      (o.gobricksUnitPrice !== undefined &&
        o.gobricksUnitPrice !== null &&
        typeof o.gobricksUnitPrice !== "string") ||
      !isOptionalExportString(o.gdsUnitPrice) ||
      !isOptionalExportString(o.gdsItemId) ||
      !isOptionalExportString(o.gdsColorId) ||
      !isOptionalExportString(o.gdsPicture) ||
      !isOptionalExportString(o.gdsCaption) ||
      !isOptionalExportString(o.gdsCaptionEn) ||
      !isOptionalExportString(o.gdsShelfState) ||
      !isOptionalExportString(o.gdsLegoColorId) ||
      !isOptionalExportString(o.gdsColorNameZh) ||
      !isOptionalExportString(o.gdsColorNameEn) ||
      typeof o.partFound !== "boolean" ||
      (o.partName !== null && typeof o.partName !== "string") ||
      (o.partCatName !== null && typeof o.partCatName !== "string") ||
      typeof o.isPrinted !== "boolean" ||
      !Array.isArray(o.sheetTags) ||
      !o.sheetTags.every(isSheetTag) ||
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
      gobricksUnitPrice:
        typeof o.gobricksUnitPrice === "string"
          ? o.gobricksUnitPrice
          : o.gobricksUnitPrice === null
            ? null
            : undefined,
      gdsUnitPrice:
        typeof o.gdsUnitPrice === "string" ? o.gdsUnitPrice : o.gdsUnitPrice === null ? null : undefined,
      gdsItemId: typeof o.gdsItemId === "string" ? o.gdsItemId : o.gdsItemId === null ? null : undefined,
      gdsColorId: typeof o.gdsColorId === "string" ? o.gdsColorId : o.gdsColorId === null ? null : undefined,
      gdsPicture: typeof o.gdsPicture === "string" ? o.gdsPicture : o.gdsPicture === null ? null : undefined,
      gdsCaption: typeof o.gdsCaption === "string" ? o.gdsCaption : o.gdsCaption === null ? null : undefined,
      gdsCaptionEn: typeof o.gdsCaptionEn === "string" ? o.gdsCaptionEn : o.gdsCaptionEn === null ? null : undefined,
      gdsShelfState: typeof o.gdsShelfState === "string" ? o.gdsShelfState : o.gdsShelfState === null ? null : undefined,
      gdsLegoColorId:
        typeof o.gdsLegoColorId === "string" ? o.gdsLegoColorId : o.gdsLegoColorId === null ? null : undefined,
      gdsColorNameZh:
        typeof o.gdsColorNameZh === "string" ? o.gdsColorNameZh : o.gdsColorNameZh === null ? null : undefined,
      gdsColorNameEn:
        typeof o.gdsColorNameEn === "string" ? o.gdsColorNameEn : o.gdsColorNameEn === null ? null : undefined,
      rest: o.rest,
      partFound: o.partFound,
      partName: o.partName as string | null,
      partCatName: o.partCatName as string | null,
      isPrinted: o.isPrinted,
      sheetTags: o.sheetTags as PartsSheetTag[],
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
    const s = (body as { filenameStem: string }).filenameStem.trim().slice(0, MAX_PARTS_SHEET_EXPORT_STEM_LEN);
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
