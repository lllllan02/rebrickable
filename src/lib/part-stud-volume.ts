/**
 * 从 Rebrickable 零件名推算占地单位（平面凸点面积，单位：stud²）。
 * 名称含尺寸时取宽 × 深；仅两段时解析长×宽；无法解析且未排除的零件在汇总时按 1 单位/颗计。
 */

const DIM3_RE = /(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/i;
const DIM2_RE = /(\d+)\s*x\s*(\d+)/i;

const MAX_DIM = 64;

export type StudVolumeParseResult = {
  width: number;
  depth: number;
  height: number;
  units: number;
};

function clampDim(n: number): number | null {
  if (!Number.isFinite(n) || n < 1 || n > MAX_DIM) return null;
  return Math.round(n);
}

/** 不参与占地汇总的零件（名称/分类） */
export function shouldExcludePartFromStudVolume(
  partName: string,
  categoryName: string | null | undefined
): boolean {
  const n = partName.trim().toLowerCase();
  const c = (categoryName ?? "").trim().toLowerCase();
  if (!n) return true;
  if (/sticker|human body|hair|mini (head|body|leg|arm)|creature body/i.test(n)) return true;
  if (/^sticker sheet\b|instruction\b|packaging\b/.test(n)) return true;
  if (c.includes("sticker") || c.includes("minifig") || c.includes("non-buildable")) return true;
  if (/\bduplo\b|\bmodulex\b|\bznap\b/i.test(n)) return true;
  return false;
}

export function parseStudVolumeFromPartName(
  partName: string,
  categoryName?: string | null
): StudVolumeParseResult | null {
  if (shouldExcludePartFromStudVolume(partName, categoryName)) return null;

  const m3 = DIM3_RE.exec(partName);
  if (m3) {
    const w = clampDim(Number.parseInt(m3[1]!, 10));
    const d = clampDim(Number.parseInt(m3[2]!, 10));
    const h = clampDim(Number.parseInt(m3[3]!, 10));
    if (w == null || d == null || h == null) return null;
    return { width: w, depth: d, height: h, units: w * d };
  }

  const m2 = DIM2_RE.exec(partName);
  if (m2) {
    const w = clampDim(Number.parseInt(m2[1]!, 10));
    const d = clampDim(Number.parseInt(m2[2]!, 10));
    if (w == null || d == null) return null;
    return { width: w, depth: d, height: 0, units: w * d };
  }

  return null;
}

export type SetStudVolumeAggregate = {
  /** 主件总颗数（不含 spare） */
  totalPieceQty: number;
  /** 能解析占地的主件颗数 */
  coveredPieceQty: number;
  /** 占地单位总和 Σ(qty × 单位)；可解析为 w×d，否则按 1/颗 */
  totalStudUnits: number;
  /** coveredPieceQty / totalPieceQty；无 BOM 时为 null */
  coverageRatio: number | null;
};

export function aggregateStudVolumeFromLines(
  lines: readonly { quantity: number; partName: string; categoryName: string | null }[]
): SetStudVolumeAggregate {
  let totalPieceQty = 0;
  let coveredPieceQty = 0;
  let totalStudUnits = 0;

  for (const line of lines) {
    const qty = line.quantity;
    if (!Number.isFinite(qty) || qty < 1) continue;
    totalPieceQty += qty;
    if (shouldExcludePartFromStudVolume(line.partName, line.categoryName)) continue;

    const parsed = parseStudVolumeFromPartName(line.partName, line.categoryName);
    if (parsed) {
      coveredPieceQty += qty;
      totalStudUnits += parsed.units * qty;
    } else {
      totalStudUnits += qty;
    }
  }

  const coverageRatio =
    totalPieceQty > 0 ? coveredPieceQty / totalPieceQty : null;

  return {
    totalPieceQty,
    coveredPieceQty,
    totalStudUnits,
    coverageRatio,
  };
}
