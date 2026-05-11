/**
 * 从用户上传的缺货表文件名中尽量解析 Rebrickable MOC 数字 ID（仅启发式，不调用 API）。
 */

import { MOC_PROFILE_MAX_DISPLAY_NAME } from "@/lib/moc-profile-parse";
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

function escapeRegExpChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 将文件名中的 slug 片段整理为可读标题（空格、长度上限） */
function slugFragmentToDisplayTitle(fragment: string): string {
  const t = fragment
    .replace(/\.csv$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length > MOC_PROFILE_MAX_DISPLAY_NAME ? t.slice(0, MOC_PROFILE_MAX_DISPLAY_NAME).trim() : t;
}

/**
 * 在已知 `mocId` 的前提下，从文件名中尽量解析 MOC 显示名称（与 {@link parseMocIdFromFilename} 常见格式一致）。
 * 若文件名与当前 ID 无法对应则返回 null；不覆盖用户已在详情页写好的名称（由调用方判断）。
 */
export function parseMocDisplayNameFromFilename(fileName: string, mocId: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const id = mocId.trim();
  if (!id) return null;

  const idRe = escapeRegExpChars(id);

  const rb = base.match(new RegExp(`^rebrickable_parts_${idRe}_(.+)\\.csv$`, "i"));
  if (rb?.[1]) {
    const title = slugFragmentToDisplayTitle(rb[1]);
    return title || null;
  }

  const mocWord = base.match(new RegExp(`(?:^|[^0-9a-z])moc[_-]?${idRe}[_-](.+)\\.csv$`, "i"));
  if (mocWord?.[1]) {
    const title = slugFragmentToDisplayTitle(mocWord[1]);
    return title || null;
  }

  const lone = base.match(new RegExp(`^${idRe}(?:[^0-9A-Za-z](.+))?\\.csv$`, "i"));
  if (lone?.[1]) {
    const title = slugFragmentToDisplayTitle(lone[1]);
    return title || null;
  }

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
