import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

function parseLegoColorId(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * 高砖商品图是否对应当前行的 `colorId`。
 * - 配货/缺件（高砖 itemList）：行 `colorId` 为高砖色，与 `gdsColorId` 对照；
 * - 完整表/手动更换：`colorId` 为乐高色，与 `gdsLegoColorId`（API lego_color_id）对照。
 * 勿将乐高 `colorId` 与高砖 `gdsColorId` 直接比较。
 */
export function gdsPictureMatchesRowColor(row: ShortageResolveItem): boolean {
  const pic = row.gdsPicture?.trim();
  if (!pic) return false;

  const gdsColorId = parseLegoColorId(row.gdsColorId);
  if (gdsColorId != null && gdsColorId === row.colorId) {
    return true;
  }

  const legoFromGds = parseLegoColorId(row.gdsLegoColorId);
  if (legoFromGds != null && legoFromGds === row.colorId) {
    return true;
  }

  if (legoFromGds == null && gdsColorId == null) {
    return true;
  }

  return false;
}

/** 本地目录中与行 `colorId` 一致的库存缩略图（行 `colorId` 须为乐高/Rebrickable 色） */
export function legoColorMatchedImgUrl(row: ShortageResolveItem): string | null {
  if (row.imgSource !== "color") return null;
  return row.imgUrl?.trim() || null;
}

/** 本地目录异色 fallback（`imgSource === "part"` 时的库存抽样图） */
export function legoPartFallbackImgUrl(row: ShortageResolveItem): string | null {
  if (!row.partFound || row.imgSource === "color") return null;
  return row.imgUrl?.trim() || null;
}

/** 与行 `colorId` 一致的高砖商品图 */
export function sheetRowGobricksThumbSrc(row: ShortageResolveItem): string | null {
  if (!gdsPictureMatchesRowColor(row)) return null;
  return row.gdsPicture!.trim();
}

/** 高砖商品图 fallback（与行色不一致时仍可用于示意） */
export function gobricksPartFallbackPicture(row: ShortageResolveItem): string | null {
  if (gdsPictureMatchesRowColor(row)) return null;
  return row.gdsPicture?.trim() || null;
}

export type SheetRowThumbMismatchKind = "lego" | "gds";

export type SheetRowThumbDisplay = {
  src: string | null;
  /** 缩略图是否与本行 `colorId` 一致 */
  colorMatched: boolean;
  mismatchKind: SheetRowThumbMismatchKind | null;
};

export function sheetThumbMismatchLabel(kind: SheetRowThumbMismatchKind): string {
  return kind === "gds" ? "色不符" : "缺色";
}

/**
 * 快照/四宫格：乐高语境下的高砖图（`legoColorId` 为原/现乐高色 ID）。
 * 仅与 `gdsLegoColorId` 对照，不与高砖 `gdsColorId` 比较。
 */
export function resolveGobricksPictureDisplay(
  picture: string | null | undefined,
  gdsLegoColorId: string | null | undefined,
  legoColorId: number
): SheetRowThumbDisplay {
  const pic = picture?.trim() || null;
  if (!pic) return { src: null, colorMatched: false, mismatchKind: null };
  const lego = parseLegoColorId(gdsLegoColorId);
  if (lego == null) {
    return { src: pic, colorMatched: false, mismatchKind: "gds" };
  }
  if (lego === legoColorId) {
    return { src: pic, colorMatched: true, mismatchKind: null };
  }
  return { src: pic, colorMatched: false, mismatchKind: "gds" };
}

/** @deprecated 使用 {@link resolveGobricksPictureDisplay} */
export function gobricksPictureForLegoColorId(
  picture: string | null | undefined,
  gdsLegoColorId: string | null | undefined,
  colorId: number
): string | null {
  return resolveGobricksPictureDisplay(picture, gdsLegoColorId, colorId).src;
}

export function resolveLegoThumbDisplay(row: ShortageResolveItem): SheetRowThumbDisplay {
  const legoColor = legoColorMatchedImgUrl(row);
  const legoFallback = legoPartFallbackImgUrl(row);
  if (legoColor) {
    return { src: legoColor, colorMatched: true, mismatchKind: null };
  }
  if (legoFallback) {
    return { src: legoFallback, colorMatched: false, mismatchKind: "lego" };
  }
  return { src: null, colorMatched: false, mismatchKind: null };
}

/**
 * @param fulfillmentListMode 配货表：能列入即视为可购配色，不标「色不符」（色不配的在缺件表）
 */
export function resolveGobricksThumbDisplay(
  row: ShortageResolveItem,
  fulfillmentListMode = false
): SheetRowThumbDisplay {
  const pic = row.gdsPicture?.trim();
  if (!pic) return { src: null, colorMatched: false, mismatchKind: null };
  if (fulfillmentListMode || gdsPictureMatchesRowColor(row)) {
    return { src: pic, colorMatched: true, mismatchKind: null };
  }
  return { src: pic, colorMatched: false, mismatchKind: "gds" };
}

/**
 * 零件表网格缩略图：优先同色；无同色图时用其它配色示意并标记「缺色」等 `mismatchKind`。
 * 配货/缺件表优先高砖同色 → 乐高同色 → 高砖异色 → 乐高异色。
 */
export function resolveSheetRowListThumb(
  row: ShortageResolveItem,
  preferGdsThumb = false,
  fulfillmentListMode = false
): SheetRowThumbDisplay {
  const lego = resolveLegoThumbDisplay(row);
  if (preferGdsThumb) {
    const gds = resolveGobricksThumbDisplay(row, fulfillmentListMode);
    if (gds.src) return gds;
    return lego;
  }
  return lego;
}

/** @deprecated 使用 {@link resolveSheetRowListThumb} */
export function sheetRowListThumbSrc(
  row: ShortageResolveItem,
  preferGdsThumb = false
): string | null {
  return resolveSheetRowListThumb(row, preferGdsThumb).src;
}
