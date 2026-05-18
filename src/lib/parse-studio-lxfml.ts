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

const BRICK_OPEN_RE =
  /<Brick\s+refID="(\d+)"\s+designID="([^"]+)"[^>]*\bitemNos="([^"]+)"/g;
const MATERIALS_RE = /materials="(\d+):/;

/**
 * 从 model.lxfml 解析砖块 refID → 设计号 / itemNos / 材质色。
 * 解析失败或空文件时返回空 Map。
 */
export function parseStudioLxfmlBrickCatalog(lxfmlText: string): Map<number, StudioLxfmlBrick> {
  const out = new Map<number, StudioLxfmlBrick>();
  if (!lxfmlText.trim()) return out;

  for (const m of lxfmlText.matchAll(BRICK_OPEN_RE)) {
    const brickRefId = Number.parseInt(m[1] ?? "", 10);
    const designId = (m[2] ?? "").trim();
    const legoItemNo = (m[3] ?? "").trim();
    if (!Number.isFinite(brickRefId) || !designId || !legoItemNo) continue;

    const tail = lxfmlText.slice(m.index ?? 0, (m.index ?? 0) + 800);
    const matM = MATERIALS_RE.exec(tail);
    const materialColorId =
      matM?.[1] != null && Number.isFinite(Number.parseInt(matM[1], 10))
        ? Number.parseInt(matM[1], 10)
        : null;

    out.set(brickRefId, { brickRefId, designId, legoItemNo, materialColorId });
  }
  return out;
}
