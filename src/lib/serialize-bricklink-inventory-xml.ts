/**
 * BrickLink「心愿单 / Wanted List」批量上传用的紧凑 XML（根节点 INVENTORY）。
 * ITEMID 为零件号；COLOR 为 BrickLink 色号（由列表中的 Rebrickable 色 ID 映射，见 `rebrickable-bricklink-color`）。
 */

export type BrickLinkInventoryXmlRow = {
  partNum: string;
  colorId: number;
  quantity: number;
};

function escapeXmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function serializeBrickLinkInventoryXml(rows: readonly BrickLinkInventoryXmlRow[]): string {
  const chunks: string[] = ["<INVENTORY>"];
  for (const r of rows) {
    const qty = Math.max(0, Math.floor(Number(r.quantity)) || 0);
    if (qty <= 0) continue;
    const color = Math.floor(Number(r.colorId)) || 0;
    const id = escapeXmlText(r.partNum.trim());
    chunks.push(
      `<ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${id}</ITEMID><COLOR>${color}</COLOR><MINQTY>${qty}</MINQTY></ITEM>`
    );
  }
  chunks.push("</INVENTORY>");
  return chunks.join("");
}
