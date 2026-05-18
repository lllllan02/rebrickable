/**
 * 乐高零件「机械规格」对照键（与高砖 `ldraw_no` / designid 匹配规则一致）。
 * 用于将 3040、3040b、3023b 等变体视为同一设计号族。
 */

/** 查询串是否为乐高式数字设计号（如 3005、3005a）。 */
export function isLegoNumericDesignId(s: string): boolean {
  return /^\d{1,6}[a-z]?$/i.test(s.trim());
}

/**
 * 乐高设计号与另一编号是否机械等价（同高砖 `legoDesignQueryMatchesToken` 规则）。
 * 例：30104 与 30104b、3040 与 3040b。
 */
export function legoMechanicalPartKeysEquivalent(a: string, b: string): boolean {
  const q = a.trim().toLowerCase();
  const t = b.trim().toLowerCase();
  if (!q || !t) return false;
  if (q === t) return true;
  return legoDesignQueryMatchesToken(q, t) || legoDesignQueryMatchesToken(t, q);
}

/**
 * 乐高设计号与 `ldraw_no` token 是否匹配（高砖站内搜索 / lego2 对齐逻辑）。
 */
export function legoDesignQueryMatchesToken(queryLower: string, token: string): boolean {
  const q = queryLower.trim().toLowerCase();
  const t = token.trim().toLowerCase();
  if (!q || !t) return false;
  if (t === q) return true;
  if (t.startsWith("gds")) return false;
  if (!isLegoNumericDesignId(q)) {
    return t.includes(q) || q.includes(t);
  }
  if (/^\d/.test(t) && t.startsWith(q)) {
    const rest = t.slice(q.length);
    return rest === "" || /^[a-z]{1,3}$/i.test(rest);
  }
  return false;
}

/** BOM 聚合用机械规格键：数字设计号去掉 1–3 位尾缀字母（3040b → 3040）。 */
export function legoMechanicalPartKey(partNum: string): string {
  const p = partNum.trim().toLowerCase();
  if (!p) return p;
  const m = /^(\d{1,6})([a-z]{1,3})?$/i.exec(p);
  if (m) return m[1]!;
  return p;
}

/** 展示用：合并同一机械规格下的多个 part_num 变体。 */
export function formatLegoMechanicalPartLabel(partNums: Iterable<string>): string {
  const sorted = [...new Set([...partNums].map((p) => p.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return sorted[0]!;
  const primary = sorted.reduce((shortest, cur) => (cur.length < shortest.length ? cur : shortest));
  const rest = sorted.filter((p) => p !== primary);
  return rest.length > 0 ? `${primary}（${rest.join(", ")}）` : primary;
}
