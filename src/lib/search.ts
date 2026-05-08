/** 限制 LIKE 通配符注入，保留常见零件号字符 */
export function likeFragment(raw: string, maxLen = 80): string {
  return raw
    .trim()
    .slice(0, maxLen)
    .replace(/%/g, "")
    .replace(/_/g, "")
    .replace(/\\/g, "");
}
