/**
 * Studio .io 内 `model.lxfml` 砖块目录。
 * `itemNos` 为 LEGO 料号（可能是 7 位 element_id，也可能是 designID+色后缀如 302401）。
 */

export type StudioLxfmlBrick = {
  brickRefId: number;
  /** LEGO 设计号，通常接近 Rebrickable part_num */
  designId: string;
  /** lxfml `itemNos`，作目录 `elements.element_id` 查找键，格式不固定 */
  legoItemNo: string;
  /** `materials="402:0"` 中的 LEGO 材质色 ID（与 LDraw 色码不同体系） */
  materialColorId: number | null;
};

/** Studio 常将 Brick 属性拆到多行，需匹配到闭合 `>` / `/>` */
const BRICK_BLOCK_RE = /<Brick\b[\s\S]*?(?:\/>|>)/gi;
const ATTR_RE = (name: string) => new RegExp(`\\b${name}="([^"]*)"`, "i");
const MATERIALS_RE = /materials="(\d+):/;

function readBrickAttr(attrs: string, name: string): string | null {
  const m = ATTR_RE(name).exec(attrs);
  return m?.[1]?.trim() ?? null;
}

/**
 * 从 model.lxfml 解析砖块 refID → 设计号 / itemNos / 材质色。
 * 属性顺序不固定；解析失败或空文件时返回空 Map。
 */
export function parseStudioLxfmlBrickCatalog(lxfmlText: string): Map<number, StudioLxfmlBrick> {
  const out = new Map<number, StudioLxfmlBrick>();
  if (!lxfmlText.trim()) return out;

  for (const m of lxfmlText.matchAll(BRICK_BLOCK_RE)) {
    const block = m[0] ?? "";
    const brickRefId = Number.parseInt(readBrickAttr(block, "refID") ?? "", 10);
    const designId = readBrickAttr(block, "designID") ?? "";
    const legoItemNo = readBrickAttr(block, "itemNos") ?? "";
    if (!Number.isFinite(brickRefId) || !designId || !legoItemNo) continue;

    const tail = lxfmlText.slice(m.index ?? 0, (m.index ?? 0) + 1200);
    const matM = MATERIALS_RE.exec(tail);
    const materialColorId =
      matM?.[1] != null && Number.isFinite(Number.parseInt(matM[1], 10))
        ? Number.parseInt(matM[1], 10)
        : null;

    out.set(brickRefId, { brickRefId, designId, legoItemNo, materialColorId });
  }
  return out;
}

/**
 * Studio 零件清单级 BOM：每个带 itemNos 的 Brick 定义计 1 片（跳过仅 brickRef 的实例引用行）。
 * 与 Studio「零件清单」导出一致，不含 lxfml 内用于渲染的重复 brickRef。
 */
export function parseStudioLxfmlBomBricks(lxfmlText: string): StudioLxfmlBrick[] {
  const out: StudioLxfmlBrick[] = [];
  if (!lxfmlText.trim()) return out;

  for (const m of lxfmlText.matchAll(BRICK_BLOCK_RE)) {
    const block = m[0] ?? "";
    if (readBrickAttr(block, "brickRef")) continue;
    const brickRefId = Number.parseInt(readBrickAttr(block, "refID") ?? "", 10);
    const designId = readBrickAttr(block, "designID") ?? "";
    const legoItemNo = readBrickAttr(block, "itemNos") ?? "";
    if (!Number.isFinite(brickRefId) || !designId || !legoItemNo) continue;

    const tail = lxfmlText.slice(m.index ?? 0, (m.index ?? 0) + 1200);
    const matM = MATERIALS_RE.exec(tail);
    const materialColorId =
      matM?.[1] != null && Number.isFinite(Number.parseInt(matM[1], 10))
        ? Number.parseInt(matM[1], 10)
        : null;

    out.push({ brickRefId, designId, legoItemNo, materialColorId });
  }
  return out;
}
