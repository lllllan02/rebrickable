import "server-only";

import type { OwnedPartCardDto } from "@/lib/owned-part-card-dto";
import { ownedPartCardKey } from "@/lib/owned-part-card-dto";
import type { OwnedPartCardRow } from "@/lib/load-owned-parts";
import { loadOwnedPartCatalogMeta } from "@/lib/load-owned-parts";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export async function serializeOwnedPartCards(
  rows: readonly OwnedPartCardRow[]
): Promise<OwnedPartCardDto[]> {
  if (rows.length === 0) return [];

  const partNums = [...new Set(rows.map((r) => r.partNum))];
  const { nameByNum, thumbByNum, thumbByPartColor, printedPartNums } =
    await loadOwnedPartCatalogMeta(
      partNums,
      rows.map((r) => ({ partNum: r.partNum, colorId: r.colorId }))
    );

  return rows.map((row) => {
    const thumbRaw =
      thumbByPartColor.get(ownedPartCardKey(row.partNum, row.colorId)) ??
      thumbByNum.get(row.partNum) ??
      null;
    return {
      partNum: row.partNum,
      colorId: row.colorId,
      colorName: row.colorName,
      quantity: row.quantity,
      name: nameByNum.get(row.partNum) ?? "",
      thumb: thumbRaw && usableImgUrl(thumbRaw) ? thumbRaw.trim() : null,
      isPrinted: printedPartNums.has(row.partNum),
    };
  });
}
