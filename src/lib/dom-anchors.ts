/** 与零件详情页元素列表的 DOM id 一致，供全局搜索跳转锚点使用 */
export function elementDomId(elementId: string): string {
  return `el-${elementId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

/** 与颜色表行的 DOM id 一致 */
export function colorDomId(colorId: number): string {
  return `color-${colorId}`;
}
