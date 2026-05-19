/**
 * 高砖 SKU / lego2 行上的颜色名解析（`color_data.name` / `name_en`）。
 */

export function readGobricksColorDataNames(cd: unknown): {
  zh: string | null;
  en: string | null;
  hex: string | null;
} {
  if (typeof cd !== "object" || cd === null) return { zh: null, en: null, hex: null };
  const o = cd as Record<string, unknown>;
  const zh = typeof o.name === "string" && o.name.trim() ? o.name.trim() : null;
  const en = typeof o.name_en === "string" && o.name_en.trim() ? o.name_en.trim() : null;
  const raw = typeof o.color === "string" ? o.color.trim() : "";
  const hex = raw ? raw.replace(/^#/, "") : null;
  return { zh, en, hex };
}

/** 从 `lego2ItemList` 单行尽量解析高砖双语色名（多数列表无 `color_data`，需后续 item/filter 补全） */
export function readColorNamesFromLego2ApiRow(row: Record<string, unknown>): {
  zh: string | null;
  en: string | null;
} {
  const pick = (v: unknown) => readGobricksColorDataNames(v);
  const { zh, en } = pick(row.color_data);
  if (zh || en) return { zh, en };
  for (const key of ["colorData", "color"]) {
    const r = pick(row[key]);
    if (r.zh || r.en) return { zh: r.zh, en: r.en };
  }
  const info = row.info;
  if (typeof info === "object" && info !== null) {
    const ir = info as Record<string, unknown>;
    const fromInfo = pick(ir.color_data);
    if (fromInfo.zh || fromInfo.en) return { zh: fromInfo.zh, en: fromInfo.en };
    const zhCand =
      (typeof ir.color_name === "string" && ir.color_name.trim()) ||
      (typeof ir.color_name_zh === "string" && ir.color_name_zh.trim()) ||
      (typeof ir.color_caption === "string" && ir.color_caption.trim()) ||
      null;
    const enCand =
      (typeof ir.color_name_en === "string" && ir.color_name_en.trim()) ||
      (typeof ir.color_caption_en === "string" && ir.color_caption_en.trim()) ||
      (typeof ir.name_en === "string" && ir.name_en.trim()) ||
      null;
    if (zhCand || enCand) return { zh: zhCand, en: enCand };
  }
  return { zh: null, en: null };
}
