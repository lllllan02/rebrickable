import colorMapData from "@/lib/rebrickable-bricklink-color-map.json";

const REBRICKABLE_TO_BRICKLINK = new Map<number, number>(
  Object.entries(colorMapData.map).map(([rb, bl]) => [Number(rb), bl])
);

/** 备注中 BrickLink Studio 导入写入的色号（见 {@link parseBrickLinkStudioPartsCsv}） */
const BRICKLINK_COLOR_IN_REST_RE = /BrickLink\s*色号\s*(\d+)/i;

export function parseBrickLinkColorIdFromSheetRest(rest: string | null | undefined): number | null {
  const m = (rest ?? "").match(BRICKLINK_COLOR_IN_REST_RE);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 列表展示的 Rebrickable `colors.id` → BrickLink 心愿单 XML 的 COLOR。
 * 例：绿色 RB 2 → BL 6（与 [Rebrickable 色表](https://rebrickable.com/colors/) 的 BrickLink 列一致）。
 */
export function rebrickableColorIdToBrickLinkColorId(rebrickableColorId: number): number | null {
  const rb = Math.trunc(Number(rebrickableColorId));
  if (!Number.isFinite(rb) || rb < 0) return null;
  return REBRICKABLE_TO_BRICKLINK.get(rb) ?? null;
}
