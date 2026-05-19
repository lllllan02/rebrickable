import { legoMechanicalPartKeysEquivalent } from "@/lib/lego-mechanical-part-key";
import { partNumsCanPairViaSubstitute } from "@/lib/lego-bom-compare-alias";
import {
  normalizeStudioLdrawColorId,
  normalizeStudioLdrawPartNum,
  STUDIO_EXTENDED_LDRAW_COLOR_OFFSET,
  type StudioIoPlacement,
} from "@/lib/parse-studio-io";
import type { StudioLxfmlBrick } from "@/lib/parse-studio-lxfml";

/**
 * Studio 导出 LDrawColorId 与 Rebrickable `colors.id` 已知不一致的配对。
 * 例：Studio 零件清单中 Trans-Light Blue 常为 LDraw 43，RB 目录为 41。
 */
const STUDIO_RB_LDRAW_COLOR_PAIRS: readonly (readonly [number, number])[] = [
  [43, 41],
  [100167, 1136],
  [167, 1136],
];

/** Studio 零件清单 / model.ldr 可能出现的 LDraw 色号别名（含 100000+ 扩展色）。 */
export function studioLdrawColorAliases(color: number): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (Number.isFinite(n) && !out.includes(n)) out.push(n);
  };
  add(color);
  const norm = normalizeStudioLdrawColorId(color);
  add(norm);
  if (color >= STUDIO_EXTENDED_LDRAW_COLOR_OFFSET) {
    add(color - STUDIO_EXTENDED_LDRAW_COLOR_OFFSET);
  } else if (color > 0) {
    add(color + STUDIO_EXTENDED_LDRAW_COLOR_OFFSET);
  }
  return out;
}

function colorsCompatible(a: number, b: number): boolean {
  const setA = new Set(studioLdrawColorAliases(a));
  const setB = new Set(studioLdrawColorAliases(b));
  if ([...setB].some((c) => setA.has(c))) return true;
  for (const [x, y] of STUDIO_RB_LDRAW_COLOR_PAIRS) {
    if ((setA.has(x) && setB.has(y)) || (setA.has(y) && setB.has(x))) return true;
  }
  return false;
}

function brickMatchesPlacementColor(
  brick: StudioLxfmlBrick,
  ldrawColorId: number,
  elementByItemNo: ReadonlyMap<string, { colorId: number }>,
  materialToLdraw: ReadonlyMap<number, number> | undefined,
  allowMaterialFallback: boolean
): boolean {
  const el = elementByItemNo.get(brick.legoItemNo);
  if (el && colorsCompatible(ldrawColorId, el.colorId)) return true;
  if (!allowMaterialFallback) return false;
  const mat = brick.materialColorId;
  if (mat != null && materialToLdraw?.has(mat)) {
    return colorsCompatible(ldrawColorId, materialToLdraw.get(mat)!);
  }
  return false;
}

/** 从 refID 与 .dat 一致的砖行，建立 LEGO 材质色 → model.ldr 原始 LDraw 色。 */
export function buildStudioMaterialToLdrawColorMap(
  placements: readonly StudioIoPlacement[],
  brickCatalog: ReadonlyMap<number, StudioLxfmlBrick>,
  elementByItemNo: ReadonlyMap<string, { colorId: number }>
): Map<number, number> {
  const map = new Map<number, number>();
  for (const p of placements) {
    if (p.brickRefId == null || p.isSubmodelRef) continue;
    const brick = brickCatalog.get(p.brickRefId);
    if (!brick?.materialColorId || !catalogBrickMatchesDatPart(brick, p.partNum)) continue;
    const el = elementByItemNo.get(brick.legoItemNo);
    if (el && !colorsCompatible(p.ldrawColorId, el.colorId)) continue;
    const mat = brick.materialColorId;
    const prev = map.get(mat);
    if (prev != null && prev !== p.ldrawColorId) continue;
    map.set(mat, p.ldrawColorId);
  }
  return map;
}

export function catalogBrickMatchesDatPart(brick: StudioLxfmlBrick, datPartNum: string): boolean {
  return legoMechanicalPartKeysEquivalent(brick.designId, datPartNum);
}

/** 由 `buildStudioIoElementLookup` 提供：part + LDraw 色 → 目录 element_id 列表（惰性缓存）。 */
export type StudioIoElementLookup = {
  elementIdsForPartColor(partNum: string, ldrawColorId: number): readonly string[];
  rebrickableColorIdForItem(itemNo: string): number | null;
  /** elements 表中的 part_num（按 itemNos / element_id） */
  rebrickablePartNumForItem(itemNo: string): string | null;
};

/**
 * brickRef 是否表示与 LDR .dat 同一颗物理件。
 * design 与 .dat 一致时直接成立；否则用 elements 表比 element_id（如 lxfml 4723 / LDR 3046.dat 同 6477380）。
 */
export function catalogBrickRefRepresentsSameElementAsPlacement(
  placement: StudioIoPlacement,
  brick: StudioLxfmlBrick,
  lookup: StudioIoElementLookup | undefined,
  substituteClosure?: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  if (catalogBrickMatchesDatPart(brick, placement.partNum)) return true;
  if (!lookup) return false;
  const item = brick.legoItemNo?.trim();
  if (!item) return false;
  if (
    lookup
      .elementIdsForPartColor(
        normalizeStudioLdrawPartNum(placement.partNum),
        placement.ldrawColorId
      )
      .includes(item)
  ) {
    return true;
  }
  const dat = normalizeStudioLdrawPartNum(placement.partNum);
  const itemPart = lookup.rebrickablePartNumForItem(item);
  if (
    itemPart &&
    (itemPart.trim().toLowerCase() === dat.toLowerCase() ||
      legoMechanicalPartKeysEquivalent(itemPart, dat))
  ) {
    const mat = brick.materialColorId;
    if (mat != null && colorsCompatible(placement.ldrawColorId, mat)) return true;
    const itemColor = lookup.rebrickableColorIdForItem(item);
    if (itemColor != null && colorsCompatible(placement.ldrawColorId, itemColor)) return true;
  }
  if (!substituteClosure?.size) return false;
  if (!partNumsCanPairViaSubstitute(brick.designId, placement.partNum, substituteClosure)) {
    return false;
  }
  const itemColor = lookup.rebrickableColorIdForItem(item);
  return itemColor != null && colorsCompatible(placement.ldrawColorId, itemColor);
}

/**
 * lxfml 零件清单是否已包含与 LDR part+色 相同 element_id 的登记（不限 designID，如 50746 清单 + 54200.dat）。
 */
export function lxfmlBomCoversPlacementElement(
  partNum: string,
  ldrawColorId: number,
  lxfmlBricks: readonly StudioLxfmlBrick[],
  lookup: StudioIoElementLookup | undefined,
  substituteClosure?: ReadonlyMap<string, ReadonlySet<string>>
): boolean {
  const dat = normalizeStudioLdrawPartNum(partNum);
  if (lookup) {
    const datElements = lookup.elementIdsForPartColor(dat, ldrawColorId);
    if (datElements.length > 0) {
      const covered = new Set(datElements);
      if (lxfmlBricks.some((b) => covered.has(b.legoItemNo.trim()))) return true;
    }
    for (const b of lxfmlBricks) {
      const item = b.legoItemNo?.trim();
      if (!item) continue;
      const itemPart = lookup.rebrickablePartNumForItem(item);
      if (!itemPart) continue;
      if (
        itemPart.trim().toLowerCase() === dat.toLowerCase() ||
        legoMechanicalPartKeysEquivalent(itemPart, dat)
      ) {
        const mat = b.materialColorId;
        if (mat != null && colorsCompatible(ldrawColorId, mat)) return true;
        const itemColor = lookup.rebrickableColorIdForItem(item);
        if (itemColor != null && colorsCompatible(ldrawColorId, itemColor)) return true;
      }
    }
  }
  if (!substituteClosure?.size || !lookup) return false;
  for (const b of lxfmlBricks) {
    if (!partNumsCanPairViaSubstitute(b.designId, dat, substituteClosure)) continue;
    const item = b.legoItemNo?.trim();
    if (!item) continue;
    const itemColor = lookup.rebrickableColorIdForItem(item);
    if (itemColor != null && colorsCompatible(ldrawColorId, itemColor)) return true;
  }
  return false;
}

/**
 * 用 model.lxfml 砖块目录 + elements 配色，为单块砖匹配 itemNos（ElementId）。
 * modelv2.ldr 的 brickRefId 与 lxfml Brick refID 常不一致，不能单靠 refID 取 itemNos。
 */
export function findStudioItemNoForPlacement(
  partNum: string,
  ldrawColorId: number,
  bricks: Iterable<StudioLxfmlBrick>,
  elementByItemNo: ReadonlyMap<string, { colorId: number }>,
  materialToLdraw?: ReadonlyMap<number, number>
): string | null {
  const matches = [...bricks].filter((b) => catalogBrickMatchesDatPart(b, partNum));
  if (matches.length === 0) return null;

  const strictHits = matches.filter((b) =>
    brickMatchesPlacementColor(b, ldrawColorId, elementByItemNo, materialToLdraw, false)
  );
  if (strictHits.length === 1) return strictHits[0]!.legoItemNo;
  if (strictHits.length > 1) {
    const nos = new Set(strictHits.map((h) => h.legoItemNo));
    if (nos.size === 1) return strictHits[0]!.legoItemNo;
  }

  if (materialToLdraw?.size) {
    const materialHits = matches.filter((b) =>
      brickMatchesPlacementColor(b, ldrawColorId, elementByItemNo, materialToLdraw, true)
    );
    if (materialHits.length === 1) return materialHits[0]!.legoItemNo;
    if (materialHits.length > 1) {
      const nos = new Set(materialHits.map((h) => h.legoItemNo));
      if (nos.size === 1) return materialHits[0]!.legoItemNo;
    }
  }

  return null;
}

function itemNoFromRefIdIfValid(
  placement: StudioIoPlacement,
  brickCatalog: ReadonlyMap<number, StudioLxfmlBrick>,
  elementByItemNo: ReadonlyMap<string, { colorId: number }>,
  materialToLdraw: ReadonlyMap<number, number>
): string | null {
  if (placement.brickRefId == null) return null;
  const brick = brickCatalog.get(placement.brickRefId);
  if (!brick || !catalogBrickMatchesDatPart(brick, placement.partNum)) return null;
  if (
    !brickMatchesPlacementColor(
      brick,
      placement.ldrawColorId,
      elementByItemNo,
      materialToLdraw,
      Boolean(materialToLdraw?.size)
    )
  ) {
    return null;
  }
  return brick.legoItemNo;
}

/**
 * 为解析出的砖块填充 legoItemNo：优先 refID（仅 design 与 .dat 一致时），否则 design+色 查目录。
 */
export function enrichStudioIoPlacementsWithItemNos(
  placements: StudioIoPlacement[],
  brickCatalog: ReadonlyMap<number, StudioLxfmlBrick> | undefined,
  elementByItemNo: ReadonlyMap<string, { colorId: number }>
): StudioIoPlacement[] {
  if (!brickCatalog?.size) return placements;
  const bricks = [...brickCatalog.values()];
  const materialToLdraw = buildStudioMaterialToLdrawColorMap(
    placements,
    brickCatalog,
    elementByItemNo
  );

  return placements.map((p) => {
    if (p.isSubmodelRef) return p;
    const itemNo = p.legoItemNo?.trim();
    if (itemNo && p.brickRefId != null) {
      const brick = brickCatalog.get(p.brickRefId);
      if (
        brick &&
        brick.legoItemNo === itemNo &&
        catalogBrickMatchesDatPart(brick, p.partNum)
      ) {
        return p;
      }
    }
    const fromRef = itemNoFromRefIdIfValid(p, brickCatalog, elementByItemNo, materialToLdraw);
    if (fromRef) return { ...p, legoItemNo: fromRef };
    if (itemNo) {
      const brick = p.brickRefId != null ? brickCatalog.get(p.brickRefId) : undefined;
      if (
        brick &&
        catalogBrickMatchesDatPart(brick, p.partNum) &&
        brickMatchesPlacementColor(
          brick,
          p.ldrawColorId,
          elementByItemNo,
          materialToLdraw,
          Boolean(materialToLdraw?.size)
        )
      ) {
        return p;
      }
    }
    const fromDesign = findStudioItemNoForPlacement(
      normalizeStudioLdrawPartNum(p.partNum),
      p.ldrawColorId,
      bricks,
      elementByItemNo,
      materialToLdraw
    );
    if (fromDesign) return { ...p, legoItemNo: fromDesign };
    return { ...p, legoItemNo: null };
  });
}
