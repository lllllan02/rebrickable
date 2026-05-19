/** 高砖 SKU 商品图：源图常在纯黑底上留白很大，缩略格内放大以裁掉边距 */
const GOBRICKS_PICTURE_ZOOM_CLASS = "origin-center scale-[2]";

export function isGobricksProductPictureUrl(url: string | null | undefined): boolean {
  const t = url?.trim();
  if (!t) return false;
  try {
    const host = new URL(t).hostname.toLowerCase();
    return host === "gobricks.cn" || host.endsWith(".gobricks.cn") || host.includes("gobricks");
  } catch {
    return false;
  }
}

/** 在 `object-contain` 容器内为高砖商品图附加放大样式（非高砖 URL 原样返回） */
export function gobricksProductPictureClassName(src: string, baseClassName?: string): string {
  const base = (baseClassName ?? "object-contain").trim();
  if (!isGobricksProductPictureUrl(src)) return base;
  const withoutPadding = base.replace(/\bp-\S+/g, "").trim();
  return `${withoutPadding} ${GOBRICKS_PICTURE_ZOOM_CLASS}`.replace(/\s+/g, " ").trim();
}
