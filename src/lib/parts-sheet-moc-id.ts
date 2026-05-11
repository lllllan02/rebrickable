/**
 * 从用户上传的缺货表文件名中尽量解析 Rebrickable MOC 数字 ID（仅启发式，不调用 API）。
 */

import type { PartsSheetTag } from "@/lib/parts-sheet-tags";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type MocPartsSheetPayloadV1 = {
  version: 1;
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  savedAt: string;
};

export function parseMocIdFromFilename(fileName: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;

  const rb = base.match(/rebrickable_parts_(\d+)_/i);
  if (rb?.[1]) return rb[1];

  const mocWord = base.match(/(?:^|[^0-9a-z])moc[_-]?(\d+)(?:[^0-9]|$)/i);
  if (mocWord?.[1]) return mocWord[1];

  const lone = base.match(/^(\d{4,})(?:[^0-9].*)?\.csv$/i);
  if (lone?.[1]) return lone[1];

  return null;
}

const SHEET_TAGS: ReadonlySet<PartsSheetTag> = new Set(["printed", "minifig", "sticker"]);

function isPartsSheetTags(v: unknown): v is PartsSheetTag[] {
  return (
    Array.isArray(v) &&
    v.every((x) => typeof x === "string" && SHEET_TAGS.has(x as PartsSheetTag))
  );
}

function isShortageResolveItem(v: unknown): v is ShortageResolveItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lineNumber === "number" &&
    typeof o.partNum === "string" &&
    typeof o.colorId === "number" &&
    typeof o.quantity === "number" &&
    typeof o.rest === "string" &&
    typeof o.partFound === "boolean" &&
    (o.partName === null || typeof o.partName === "string") &&
    (o.partCatName === null || typeof o.partCatName === "string") &&
    typeof o.isPrinted === "boolean" &&
    isPartsSheetTags(o.sheetTags) &&
    (o.colorName === null || typeof o.colorName === "string") &&
    typeof o.elementKnown === "boolean" &&
    (o.imgUrl === null || typeof o.imgUrl === "string") &&
    (o.imgSource === null || o.imgSource === "color" || o.imgSource === "part")
  );
}

/** 校验持久化 JSON（数据库 payload 或 API 体），失败返回 null */
export function parseStoredMocPartsSheet(raw: unknown): MocPartsSheetPayloadV1 | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (typeof o.skippedHeader !== "boolean") return null;
  if (typeof o.savedAt !== "string") return null;
  if (!Array.isArray(o.items) || !o.items.every(isShortageResolveItem)) return null;
  return {
    version: 1,
    skippedHeader: o.skippedHeader,
    items: o.items,
    savedAt: o.savedAt,
  };
}

/** POST 请求体中的 items 数组校验 */
export function parseMocSheetItems(items: unknown): ShortageResolveItem[] | null {
  if (!Array.isArray(items) || !items.every(isShortageResolveItem)) return null;
  return items;
}
