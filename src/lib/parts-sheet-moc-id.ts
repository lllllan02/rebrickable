/**
 * 从用户上传的缺货表文件名中尽量解析 Rebrickable MOC 数字 ID（仅启发式，不调用 API）。
 */

import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { MOC_PROFILE_MAX_DISPLAY_NAME } from "@/lib/moc-profile-parse";
import type { PartsSheetTag } from "@/lib/parts-sheet-tags";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type MocPartsSheetPayloadV1 = {
  version: 1;
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  savedAt: string;
};

/** 单一分支（完整表或缺件表） */
export type MocSheetBranchPayload = {
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  savedAt: string;
};

export type MocPartsSheetPayloadV2 = {
  version: 2;
  /** 未上传完整表时为 null */
  full: MocSheetBranchPayload | null;
  /** 未上传缺件表时为 null */
  shortage: MocSheetBranchPayload | null;
};

/** 内存中归一化结构（含从 v1 迁移）；至少一侧非空 */
export type StoredMocDualSheets = {
  full: MocSheetBranchPayload | null;
  shortage: MocSheetBranchPayload | null;
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
export function slugFragmentToDisplayTitle(fragment: string): string {
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

/** 从文件名启发式解析官方套装编号（如 42143-1） */
export function parseSetNumFromFilename(fileName: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const rb = base.match(/\b(\d{4,6}-\d+)\b/);
  if (rb?.[1]) return rb[1];
  const prefixed = base.match(/(?:^|[^0-9a-z])set[_-]?(\d{4,6}-\d+)/i);
  if (prefixed?.[1]) return prefixed[1];
  return null;
}

/**
 * 在已知 `setNum` 的前提下，从文件名中尽量解析套装显示名称。
 */
export function parseSetDisplayNameFromFilename(fileName: string, setNum: string): string | null {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName;
  const id = setNum.trim();
  if (!id) return null;
  const idRe = escapeRegExpChars(id);

  const rb = base.match(new RegExp(`^rebrickable_parts_${idRe}_(.+)\\.csv$`, "i"));
  if (rb?.[1]) {
    const title = slugFragmentToDisplayTitle(rb[1]);
    return title || null;
  }

  const setWord = base.match(new RegExp(`(?:^|[^0-9a-z])set[_-]?${idRe}[_-](.+)\\.csv$`, "i"));
  if (setWord?.[1]) {
    const title = slugFragmentToDisplayTitle(setWord[1]);
    return title || null;
  }

  const lone = base.match(new RegExp(`^${idRe}(?:[^0-9A-Za-z](.+))?\\.csv$`, "i"));
  if (lone?.[1]) {
    const title = slugFragmentToDisplayTitle(lone[1]);
    return title || null;
  }

  return null;
}

export function parseBuildSubjectIdFromFilename(kind: BuildSubjectKind, fileName: string): string | null {
  if (kind === BUILD_SUBJECT_MOC) return parseMocIdFromFilename(fileName);
  return parseSetNumFromFilename(fileName);
}

export function parseBuildDisplayNameFromFilename(
  kind: BuildSubjectKind,
  fileName: string,
  subjectId: string
): string | null {
  if (kind === BUILD_SUBJECT_MOC) return parseMocDisplayNameFromFilename(fileName, subjectId);
  return parseSetDisplayNameFromFilename(fileName, subjectId);
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
    (o.gobricksUnitPrice === undefined ||
      o.gobricksUnitPrice === null ||
      typeof o.gobricksUnitPrice === "string") &&
    (o.imgUrl === null || typeof o.imgUrl === "string") &&
    (o.imgSource === null || o.imgSource === "color" || o.imgSource === "part")
  );
}

function isSheetBranchPayload(v: unknown): v is MocSheetBranchPayload {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.skippedHeader === "boolean" &&
    typeof o.savedAt === "string" &&
    Array.isArray(o.items) &&
    o.items.length > 0 &&
    o.items.every(isShortageResolveItem)
  );
}

/**
 * 校验持久化 JSON（v1 单表 或 v2 双表），失败返回 null。
 * v1 视为仅含「完整零件表」，缺件表为空。
 */
export function parseStoredMocDualSheets(raw: unknown): StoredMocDualSheets | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  if (o.version === 2) {
    const full =
      o.full === null ? null : isSheetBranchPayload(o.full) ? (o.full as MocSheetBranchPayload) : null;
    const shortage =
      o.shortage === null
        ? null
        : isSheetBranchPayload(o.shortage)
          ? (o.shortage as MocSheetBranchPayload)
          : null;
    if (!full && !shortage) return null;
    return { full, shortage };
  }

  if (o.version === 1) {
    if (typeof o.skippedHeader !== "boolean") return null;
    if (typeof o.savedAt !== "string") return null;
    if (!Array.isArray(o.items) || !o.items.every(isShortageResolveItem) || o.items.length === 0) {
      return null;
    }
    return {
      full: {
        skippedHeader: o.skippedHeader,
        items: o.items,
        savedAt: o.savedAt,
      },
      shortage: null,
    };
  }

  return null;
}

/** @deprecated 使用 {@link parseStoredMocDualSheets}；仍返回 v1 形状供旧逻辑读取「完整表」 */
export function parseStoredMocPartsSheet(raw: unknown): MocPartsSheetPayloadV1 | null {
  const dual = parseStoredMocDualSheets(raw);
  if (!dual?.full) return null;
  return {
    version: 1,
    skippedHeader: dual.full.skippedHeader,
    items: dual.full.items,
    savedAt: dual.full.savedAt,
  };
}

export function dualSheetsToPayloadV2(dual: StoredMocDualSheets): MocPartsSheetPayloadV2 {
  if (!dual.full && !dual.shortage) {
    throw new Error("dualSheetsToPayloadV2: 至少一侧须有数据");
  }
  return {
    version: 2,
    full: dual.full,
    shortage: dual.shortage,
  };
}

/** POST 请求体中的 items 数组校验 */
export function parseMocSheetItems(items: unknown): ShortageResolveItem[] | null {
  if (!Array.isArray(items) || !items.every(isShortageResolveItem)) return null;
  return items;
}
