/**
 * 高砖展示用名称：不与颜色拼接；兼容旧数据里 `名称 / 颜色` 的 gdsCaption。
 */

/** 从 caption 中去掉与 {@link colorName} 对应的「 / …」后缀（更换零件曾写入） */
export function gobricksCaptionNameOnly(
  caption: string | null | undefined,
  colorName?: string | null
): string {
  const cap = caption?.trim() ?? "";
  if (!cap) return "";
  const cn = colorName?.trim();
  if (!cn) return cap;

  const directSuffix = ` / ${cn}`;
  if (cap.endsWith(directSuffix)) {
    return cap.slice(0, -directSuffix.length).trim();
  }

  const idx = cap.lastIndexOf(" / ");
  if (idx > 0) {
    const tail = cap.slice(idx + 3).trim();
    if (tail === cn || tail.startsWith(`${cn} `) || tail.startsWith(`${cn}·`) || tail.startsWith(`${cn} ·`)) {
      return cap.slice(0, idx).trim();
    }
  }
  return cap;
}

export function gobricksCaptionNameOrFallback(
  caption: string | null | undefined,
  captionEn: string | null | undefined,
  colorName?: string | null
): string {
  const zh = gobricksCaptionNameOnly(caption, colorName);
  if (zh) return zh;
  const en = gobricksCaptionNameOnly(captionEn, colorName);
  return en;
}

/** 高砖颜色展示：中文 · 英文（相同则只显示一次） */
export function formatGobricksBilingualColorLabel(input: {
  nameZh?: string | null;
  nameEn?: string | null;
  /** 目录/Rebrickable 色名（无高砖双语时的兜底） */
  catalogColorName?: string | null;
}): string {
  const zh = input.nameZh?.trim() || "";
  const en = input.nameEn?.trim() || "";
  if (zh && en) return zh === en ? zh : `${zh} · ${en}`;
  if (zh) return zh;
  if (en) return en;
  return input.catalogColorName?.trim() || "";
}

export function formatGobricksColorLine(input: {
  nameZh?: string | null;
  nameEn?: string | null;
  catalogColorName?: string | null;
}): string {
  const label = formatGobricksBilingualColorLabel(input);
  return label || "—";
}

/** 高砖整单参考价（元，`gdsPrice` 分片之和）；无效时返回 null */
export function formatGobricksGdsPriceCny(gobricksGdsPriceCny: number | null | undefined): string | null {
  if (
    typeof gobricksGdsPriceCny !== "number" ||
    !Number.isFinite(gobricksGdsPriceCny) ||
    gobricksGdsPriceCny < 0
  ) {
    return null;
  }
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(gobricksGdsPriceCny);
}
