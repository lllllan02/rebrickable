import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { colors, mocParts, mocs, parts } from "@/db/schema";

import {
  detectInventoryFormat,
  parseMocInventoryContent,
  type MocInventoryRow,
} from "@/lib/moc-import-parse";

export type { MocInventoryRow } from "@/lib/moc-import-parse";

export { detectInventoryFormat, parseMocInventoryContent } from "@/lib/moc-import-parse";

export type MocImportResult = {
  ok: boolean;
  message: string;
};

function normalizeOptionalSetNum(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return /^\d+$/.test(trimmed) ? `${trimmed}-1` : trimmed;
}

export type ImportMocParams = {
  mocId: number;
  name: string;
  designerName?: string | null;
  sourceSetNum?: string | null;
  rebrickableUrl?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  inventoryText: string;
  inventoryFilename: string;
};

const maxInventoryBytes = 8 * 1024 * 1024;

export function importMocInventory(params: ImportMocParams): MocImportResult {
  const {
    mocId,
    name,
    designerName,
    sourceSetNum,
    rebrickableUrl,
    imageUrl,
    notes,
    inventoryText,
    inventoryFilename,
  } = params;

  if (!Number.isInteger(mocId) || mocId <= 0) {
    return { ok: false, message: "MOC ID 须为正整数。" };
  }

  const trimmedName = name.trim();

  if (!trimmedName) {
    return { ok: false, message: "MOC 名称不能为空。" };
  }

  const buf = Buffer.byteLength(inventoryText, "utf8");

  if (buf > maxInventoryBytes) {
    return { ok: false, message: `清单文件过大（超过 ${maxInventoryBytes / (1024 * 1024)} MB）。` };
  }

  let rows: MocInventoryRow[];

  try {
    const format = detectInventoryFormat(inventoryFilename, inventoryText);
    rows = parseMocInventoryContent(inventoryText, format);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "清单解析失败。";

    return { ok: false, message: msg };
  }

  const source = normalizeOptionalSetNum(sourceSetNum);
  const now = new Date();
  const totalQty = rows.reduce((acc, r) => acc + r.quantity, 0);
  const numParts = rows.length > 0 ? totalQty : null;

  const colorIds = [...new Set(rows.map((r) => r.colorId))];
  const partNums = [...new Set(rows.map((r) => r.partNum))];

  try {
    db.transaction((tx) => {
      for (const colorId of colorIds) {
        const existing = tx.select({ id: colors.id }).from(colors).where(eq(colors.id, colorId)).get();

        if (!existing) {
          tx.insert(colors)
            .values({
              id: colorId,
              name: `颜色 #${colorId}`,
              rgb: null,
              isTransparent: false,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }
      }

      for (const partNum of partNums) {
        const existing = tx
          .select({ partNum: parts.partNum })
          .from(parts)
          .where(eq(parts.partNum, partNum))
          .get();

        if (!existing) {
          tx.insert(parts)
            .values({
              partNum,
              name: `未同步零件 ${partNum}`,
              categoryId: null,
              categoryName: null,
              imageUrl: null,
              rebrickableUrl: null,
              rawJson: null,
              downloadedAt: null,
              createdAt: now,
              updatedAt: now,
            })
            .run();
        }
      }

      tx.insert(mocs)
        .values({
          mocId,
          name: trimmedName,
          designerName: designerName?.trim() || null,
          sourceSetNum: source,
          numParts,
          imageUrl: imageUrl?.trim() || null,
          rebrickableUrl: rebrickableUrl?.trim() || null,
          notes: notes?.trim() || null,
          rawJson: null,
          downloadedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: mocs.mocId,
          set: {
            name: trimmedName,
            designerName: designerName?.trim() || null,
            sourceSetNum: source,
            numParts,
            imageUrl: imageUrl?.trim() || null,
            rebrickableUrl: rebrickableUrl?.trim() || null,
            notes: notes?.trim() || null,
            rawJson: null,
            downloadedAt: now,
            updatedAt: now,
          },
        })
        .run();

      tx.delete(mocParts).where(eq(mocParts.mocId, mocId)).run();

      for (const row of rows) {
        tx.insert(mocParts)
          .values({
            mocId,
            partNum: row.partNum,
            colorId: row.colorId,
            quantity: row.quantity,
            isSpare: row.isSpare,
            rawJson: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "写入数据库失败。";

    return { ok: false, message: msg };
  }

  return {
    ok: true,
    message: `已导入 MOC-${mocId}：${rows.length} 条零件行，共 ${totalQty} 件。`,
  };
}
