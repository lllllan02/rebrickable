import { and, eq, inArray, isNotNull, min, ne } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import type { GobricksSheetSerializedRow } from "@/lib/gobricks-sheet-serialized-row";
import { parsePartsSheetCsv } from "@/lib/parse-parts-sheet-csv";
import type { ShortageCsvRow } from "@/lib/parse-shortage-csv";
import { classifyPartsSheetRow } from "@/lib/parts-sheet-tags";
import {
  resolvePartsSheetCsvRowIdentities,
  type PartsSheetCsvRowIdentity,
} from "@/lib/parts-sheet-csv-element-resolve";
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

function sheetRowUnitPriceTrimmed(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length > 0 ? t : null;
}

export type ResolveShortageCsvDbResult =
  | { ok: true; skippedHeader: boolean; items: ShortageResolveItem[] }
  | { ok: false; error: string; lineNumber?: number | null };

type EnrichSourceRow = {
  lineNumber: number;
  quantity: number;
  rest: string;
  gobricksUnitPrice: string | null;
  gdsUnitPrice?: string | null;
  gdsItemId?: string | null;
  gdsColorId?: string | null;
  gdsPicture?: string | null;
  gdsCaption?: string | null;
  gdsCaptionEn?: string | null;
  gdsShelfState?: string | null;
  gdsLegoColorId?: string | null;
  gdsColorNameZh?: string | null;
  gdsColorNameEn?: string | null;
};

async function enrichPartsSheetIdentitiesInDb(
  identities: readonly PartsSheetCsvRowIdentity[],
  sources: readonly EnrichSourceRow[]
): Promise<ShortageResolveItem[]> {
  if (identities.length === 0) return [];
  if (identities.length !== sources.length) {
    throw new Error("enrichPartsSheetIdentitiesInDb: identities/sources 长度不一致");
  }

  const db = getCatalogDb();
  const partNums = [...new Set(identities.map((r) => r.partNum))];
  const colorIds = [...new Set(identities.map((r) => r.colorId))];
  const elementIds = [
    ...new Set(
      identities.map((r) => r.elementId?.trim()).filter((id): id is string => Boolean(id))
    ),
  ];

  const [partRows, colorRows, thumbByPartColor, thumbByPart, printedRows, elementRows] =
    await Promise.all([
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
              and(
                eq(partRelationships.relType, "P"),
                inArray(partRelationships.childPartNum, partNums)
              )
            )
            .groupBy(partRelationships.childPartNum)
        : Promise.resolve([] as { partNum: string }[]),
      elementIds.length > 0
        ? db
            .select({ elementId: elements.elementId })
            .from(elements)
            .where(inArray(elements.elementId, elementIds))
        : Promise.resolve([] as { elementId: string }[]),
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
    const elPcRows = await db
      .select({
        partNum: elements.partNum,
        colorId: elements.colorId,
      })
      .from(elements)
      .where(and(inArray(elements.partNum, partNums), inArray(elements.colorId, colorIds)));
    for (const e of elPcRows) {
      elementKnownSet.add(`${e.partNum}\t${e.colorId}`);
    }
  }
  const elementIdKnownSet = new Set(elementRows.map((e) => e.elementId));

  return identities.map((id, i) => {
    const src = sources[i]!;
    const partFound = partNameByNum.has(id.partNum);
    const partName = partNameByNum.get(id.partNum) ?? null;
    const partCatName = partCatNameByNum.get(id.partNum) ?? null;
    const isPrinted = printedPartNums.has(id.partNum);
    const sheetTags = classifyPartsSheetRow({ partFound, partCatName, isPrinted });
    const colorName = colorNameById.get(id.colorId) ?? null;
    const key = `${id.partNum}\t${id.colorId}`;
    const colorThumb = thumbPc.get(key) ?? null;
    const partThumb = thumbP.get(id.partNum) ?? null;
    let imgUrl: string | null = null;
    let imgSource: "color" | "part" | null = null;
    if (colorThumb) {
      imgUrl = colorThumb;
      imgSource = "color";
    } else if (partThumb) {
      imgUrl = partThumb;
      imgSource = "part";
    }

    const gdsU = sheetRowUnitPriceTrimmed(src.gdsUnitPrice);
    const gbU = sheetRowUnitPriceTrimmed(src.gobricksUnitPrice);
    const price = gdsU ?? gbU ?? null;
    const eid = id.elementId?.trim() || null;
    const elementKnown =
      (eid != null && elementIdKnownSet.has(eid)) || elementKnownSet.has(key);

    return {
      lineNumber: src.lineNumber,
      partNum: id.partNum,
      colorId: id.colorId,
      elementId: eid,
      quantity: src.quantity,
      gobricksUnitPrice: price,
      gdsUnitPrice: gdsU ?? price,
      gdsItemId: src.gdsItemId,
      gdsColorId: src.gdsColorId,
      gdsPicture: src.gdsPicture,
      gdsCaption: src.gdsCaption,
      gdsCaptionEn: src.gdsCaptionEn,
      gdsShelfState: src.gdsShelfState,
      gdsLegoColorId: src.gdsLegoColorId,
      gdsColorNameZh: src.gdsColorNameZh ?? null,
      gdsColorNameEn: src.gdsColorNameEn ?? null,
      rest: src.rest,
      partFound,
      partName,
      partCatName,
      isPrinted,
      sheetTags,
      colorName,
      elementKnown,
      imgUrl,
      imgSource,
    };
  });
}

function csvRowsToIdentities(rows: readonly ShortageCsvRow[]): PartsSheetCsvRowIdentity[] {
  return rows.map((r) => ({
    partNum: r.partNum,
    colorId: r.colorId,
    elementId: r.elementId,
  }));
}

function gobricksRowsToIdentities(rows: readonly GobricksSheetSerializedRow[]): PartsSheetCsvRowIdentity[] {
  return rows.map((r) => ({
    partNum: r.partNum,
    colorId: r.colorId,
    elementId: r.elementId ?? null,
  }));
}

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

  const identities = await resolvePartsSheetCsvRowIdentities(gobricksRowsToIdentities(rows));
  const sources: EnrichSourceRow[] = rows.map((r, i) => ({
    lineNumber: i + 1,
    quantity: r.quantity,
    rest: r.rest,
    gobricksUnitPrice: r.gobricksUnitPrice,
    gdsUnitPrice: r.gdsUnitPrice,
    gdsItemId: r.gdsItemId,
    gdsColorId: r.gdsColorId,
    gdsPicture: r.gdsPicture,
    gdsCaption: r.gdsCaption,
    gdsCaptionEn: r.gdsCaptionEn,
    gdsShelfState: r.gdsShelfState,
    gdsLegoColorId: r.gdsLegoColorId,
    gdsColorNameZh: r.gdsColorNameZh,
    gdsColorNameEn: r.gdsColorNameEn,
  }));

  const items = await enrichPartsSheetIdentitiesInDb(identities, sources);
  return { ok: true, skippedHeader: true, items };
}

export async function resolveShortageCsvInDb(csv: string): Promise<ResolveShortageCsvDbResult> {
  if (csv.length > MAX_CSV_CHARS) {
    return { ok: false, error: `CSV 过长（上限 ${MAX_CSV_CHARS} 字符）。` };
  }

  const parsed = parsePartsSheetCsv(csv);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, lineNumber: parsed.lineNumber ?? null };
  }

  if (parsed.rows.length === 0) {
    return { ok: true, skippedHeader: parsed.skippedHeader, items: [] };
  }

  if (parsed.rows.length > MAX_SHEET_ROWS) {
    return { ok: false, error: `行数超过上限 ${MAX_SHEET_ROWS}。`, lineNumber: null };
  }

  const identities = await resolvePartsSheetCsvRowIdentities(csvRowsToIdentities(parsed.rows));
  const sources: EnrichSourceRow[] = parsed.rows.map((r) => ({
    lineNumber: r.lineNumber,
    quantity: r.quantity,
    rest: r.rest,
    gobricksUnitPrice: r.gobricksUnitPrice,
  }));

  const items = await enrichPartsSheetIdentitiesInDb(identities, sources);
  return { ok: true, skippedHeader: parsed.skippedHeader, items };
}
