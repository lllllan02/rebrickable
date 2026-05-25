/**
 * 从 Rebrickable 零件名推算「凸点单位」体积：宽 × 深 × 高（单位：stud）。
 * 名称含三段尺寸时直接解析；仅两段时按砖/板类推断高度（板=1，砖=3）。
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

function inferHeightStuds(partName: string, categoryName: string | null | undefined): number {
  const n = partName.toLowerCase();
  const c = (categoryName ?? "").toLowerCase();
  if (/\bbrick\b|\bblock\b/.test(n) || c.includes("brick")) return 3;
  if (/\bplate\b|\btile\b|\bpanel\b|\bbaseplate\b/.test(n) || /plate|tile/.test(c)) return 1;
  return 1;
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
    return { width: w, depth: d, height: h, units: w * d * h };
  }

  const m2 = DIM2_RE.exec(partName);
  if (m2) {
    const w = clampDim(Number.parseInt(m2[1]!, 10));
    const d = clampDim(Number.parseInt(m2[2]!, 10));
    if (w == null || d == null) return null;
    const h = inferHeightStuds(partName, categoryName);
    return { width: w, depth: d, height: h, units: w * d * h };
  }

  return null;
}

export type SetStudVolumeAggregate = {
  /** 主件总颗数（不含 spare） */
  totalPieceQty: number;
  /** 能解析占地的主件颗数 */
  coveredPieceQty: number;
  /** 占地单位总和 Σ(qty × w × d × h) */
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
    const parsed = parseStudVolumeFromPartName(line.partName, line.categoryName);
    if (!parsed) continue;
    coveredPieceQty += qty;
    totalStudUnits += parsed.units * qty;
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
