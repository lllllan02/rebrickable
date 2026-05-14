import { and, eq, inArray, isNotNull, min, ne } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import type { GobricksSheetSerializedRow } from "@/lib/gobricks-sheet-serialized-row";
import { classifyPartsSheetRow } from "@/lib/parts-sheet-tags";
import { parseShortageCsv } from "@/lib/parse-shortage-csv";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";
import {
  colors,
  elements,
  inventoryParts,
  partCategories,
  partRelationships,
  parts,
} from "@/db/schema";

const MAX_CSV_CHARS = 512_000;
const MAX_SHEET_ROWS = 100_000;

export type ResolveShortageCsvDbResult =
  | { ok: true; skippedHeader: boolean; items: ShortageResolveItem[] }
  | { ok: false; error: string; lineNumber?: number | null };

/**
 * 将高砖序列化产出的行（`fulfillmentSerializeRowsFromGobricksPayload` / `shortageSerializeRowsFromGobricksPayload`）
 * 与本地目录库对齐，保留全部 `gds_*` 字段。
 */
export async function resolveGobricksSheetSerializedRowsInDb(
  rows: readonly GobricksSheetSerializedRow[]
): Promise<ResolveShortageCsvDbResult> {
  if (rows.length === 0) {
    return { ok: true, skippedHeader: false, items: [] };
  }
  if (rows.length > MAX_SHEET_ROWS) {
    return { ok: false, error: `行数超过上限 ${MAX_SHEET_ROWS}。`, lineNumber: null };
  }

  const db = getCatalogDb();
  const partNums = [...new Set(rows.map((r) => r.partNum))];
  const colorIds = [...new Set(rows.map((r) => r.colorId))];

  const [partRows, colorRows, thumbByPartColor, thumbByPart, printedRows] = await Promise.all([
    db
      .select({
        partNum: parts.partNum,
        name: parts.name,
        catName: partCategories.name,
      })
      .from(parts)
      .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
      .where(inArray(parts.partNum, partNums)),
    db
      .select({ id: colors.id, name: colors.name })
      .from(colors)
      .where(inArray(colors.id, colorIds)),
    db
      .select({
        partNum: inventoryParts.partNum,
        colorId: inventoryParts.colorId,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, partNums),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum, inventoryParts.colorId),
    db
      .select({
        partNum: inventoryParts.partNum,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, partNums),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum),
    partNums.length > 0
      ? db
          .select({ partNum: partRelationships.childPartNum })
          .from(partRelationships)
          .where(
            and(eq(partRelationships.relType, "P"), inArray(partRelationships.childPartNum, partNums))
          )
          .groupBy(partRelationships.childPartNum)
      : Promise.resolve([] as { partNum: string }[]),
  ]);

  const partNameByNum = new Map(partRows.map((r) => [r.partNum, r.name] as const));
  const partCatNameByNum = new Map(partRows.map((r) => [r.partNum, r.catName] as const));
  const printedPartNums = new Set(printedRows.map((r) => r.partNum));
  const colorNameById = new Map(colorRows.map((r) => [r.id, r.name] as const));
  const thumbPc = new Map<string, string>();
  for (const t of thumbByPartColor) {
    if (t.thumb) thumbPc.set(`${t.partNum}\t${t.colorId}`, t.thumb);
  }
  const thumbP = new Map<string, string>();
  for (const t of thumbByPart) {
    if (t.thumb) thumbP.set(t.partNum, t.thumb);
  }

  const elementKnownSet = new Set<string>();
  if (partNums.length > 0) {
    const elRows = await db
      .select({
        partNum: elements.partNum,
        colorId: elements.colorId,
      })
      .from(elements)
      .where(and(inArray(elements.partNum, partNums), inArray(elements.colorId, colorIds)));
    for (const e of elRows) {
      elementKnownSet.add(`${e.partNum}\t${e.colorId}`);
    }
  }

  const items: ShortageResolveItem[] = rows.map((r, i) => {
    const partFound = partNameByNum.has(r.partNum);
    const partName = partNameByNum.get(r.partNum) ?? null;
    const partCatName = partCatNameByNum.get(r.partNum) ?? null;
    const isPrinted = printedPartNums.has(r.partNum);
    const sheetTags = classifyPartsSheetRow({ partFound, partCatName, isPrinted });
    const colorName = colorNameById.get(r.colorId) ?? null;
    const key = `${r.partNum}\t${r.colorId}`;
    const colorThumb = thumbPc.get(key) ?? null;
    const partThumb = thumbP.get(r.partNum) ?? null;
    let imgUrl: string | null = null;
    let imgSource: "color" | "part" | null = null;
    if (colorThumb) {
      imgUrl = colorThumb;
      imgSource = "color";
    } else if (partThumb) {
      imgUrl = partThumb;
      imgSource = "part";
    }
    const price = r.gdsUnitPrice ?? r.gobricksUnitPrice ?? null;
    return {
      lineNumber: i + 1,
      partNum: r.partNum,
      colorId: r.colorId,
      quantity: r.quantity,
      gobricksUnitPrice: price,
      gdsUnitPrice: r.gdsUnitPrice ?? price,
      gdsItemId: r.gdsItemId,
      gdsColorId: r.gdsColorId,
      gdsPicture: r.gdsPicture,
      gdsCaption: r.gdsCaption,
      gdsCaptionEn: r.gdsCaptionEn,
      gdsShelfState: r.gdsShelfState,
      gdsLegoColorId: r.gdsLegoColorId,
      rest: r.rest,
      partFound,
      partName,
      partCatName,
      isPrinted,
      sheetTags,
      colorName,
      elementKnown: elementKnownSet.has(key),
      imgUrl,
      imgSource,
    };
  });

  return { ok: true, skippedHeader: false, items };
}

export async function resolveShortageCsvInDb(csv: string): Promise<ResolveShortageCsvDbResult> {
  if (csv.length > MAX_CSV_CHARS) {
    return { ok: false, error: `CSV 过长（上限 ${MAX_CSV_CHARS} 字符）。` };
  }

  const parsed = parseShortageCsv(csv);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, lineNumber: parsed.lineNumber ?? null };
  }

  if (parsed.rows.length === 0) {
    return { ok: true, skippedHeader: parsed.skippedHeader, items: [] };
  }

  const db = getCatalogDb();
  const partNums = [...new Set(parsed.rows.map((r) => r.partNum))];
  const colorIds = [...new Set(parsed.rows.map((r) => r.colorId))];

  const [partRows, colorRows, thumbByPartColor, thumbByPart, printedRows] = await Promise.all([
    db
      .select({
        partNum: parts.partNum,
        name: parts.name,
        catName: partCategories.name,
      })
      .from(parts)
      .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
      .where(inArray(parts.partNum, partNums)),
    db
      .select({ id: colors.id, name: colors.name })
      .from(colors)
      .where(inArray(colors.id, colorIds)),
    db
      .select({
        partNum: inventoryParts.partNum,
        colorId: inventoryParts.colorId,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, partNums),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum, inventoryParts.colorId),
    db
      .select({
        partNum: inventoryParts.partNum,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, partNums),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum),
    partNums.length > 0
      ? db
          .select({ partNum: partRelationships.childPartNum })
          .from(partRelationships)
          .where(
            and(eq(partRelationships.relType, "P"), inArray(partRelationships.childPartNum, partNums))
          )
          .groupBy(partRelationships.childPartNum)
      : Promise.resolve([] as { partNum: string }[]),
  ]);

  const partNameByNum = new Map(partRows.map((r) => [r.partNum, r.name] as const));
  const partCatNameByNum = new Map(partRows.map((r) => [r.partNum, r.catName] as const));
  const printedPartNums = new Set(printedRows.map((r) => r.partNum));
  const colorNameById = new Map(colorRows.map((r) => [r.id, r.name] as const));
  const thumbPc = new Map<string, string>();
  for (const t of thumbByPartColor) {
    if (t.thumb) thumbPc.set(`${t.partNum}\t${t.colorId}`, t.thumb);
  }
  const thumbP = new Map<string, string>();
  for (const t of thumbByPart) {
    if (t.thumb) thumbP.set(t.partNum, t.thumb);
  }

  const elementKnownSet = new Set<string>();
  if (partNums.length > 0) {
    const elRows = await db
      .select({
        partNum: elements.partNum,
        colorId: elements.colorId,
      })
      .from(elements)
      .where(and(inArray(elements.partNum, partNums), inArray(elements.colorId, colorIds)));
    for (const e of elRows) {
      elementKnownSet.add(`${e.partNum}\t${e.colorId}`);
    }
  }

  const items: ShortageResolveItem[] = parsed.rows.map((r) => {
    const partFound = partNameByNum.has(r.partNum);
    const partName = partNameByNum.get(r.partNum) ?? null;
    const partCatName = partCatNameByNum.get(r.partNum) ?? null;
    const isPrinted = printedPartNums.has(r.partNum);
    const sheetTags = classifyPartsSheetRow({ partFound, partCatName, isPrinted });
    const colorName = colorNameById.get(r.colorId) ?? null;
    const key = `${r.partNum}\t${r.colorId}`;
    const colorThumb = thumbPc.get(key) ?? null;
    const partThumb = thumbP.get(r.partNum) ?? null;
    let imgUrl: string | null = null;
    let imgSource: "color" | "part" | null = null;
    if (colorThumb) {
      imgUrl = colorThumb;
      imgSource = "color";
    } else if (partThumb) {
      imgUrl = partThumb;
      imgSource = "part";
    }

    const price = r.gobricksUnitPrice;
    return {
      lineNumber: r.lineNumber,
      partNum: r.partNum,
      colorId: r.colorId,
      quantity: r.quantity,
      gobricksUnitPrice: price,
      gdsUnitPrice: price ?? null,
      rest: r.rest,
      partFound,
      partName,
      partCatName,
      isPrinted,
      sheetTags,
      colorName,
      elementKnown: elementKnownSet.has(key),
      imgUrl,
      imgSource,
    };
  });

  return { ok: true, skippedHeader: parsed.skippedHeader, items };
}
