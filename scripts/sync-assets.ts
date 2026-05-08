/**
 * 将 Rebrickable 官方 CSV 导出（默认位于 ./assets/*.csv.gz）导入本地 SQLite。
 *
 * 用法：pnpm sync:assets
 * 环境变量：REBRICKABLE_DB_PATH（可选）、ASSETS_DIR（可选，默认 ./assets）
 */

import { createReadStream } from "node:fs";
import { mkdirSync } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { createGunzip } from "node:zlib";

import Database from "better-sqlite3";
import { parse } from "csv-parse";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../src/db/schema";

const {
  colors,
  partCategories,
  partColorOptions,
  partRelationships,
  parts,
  setParts,
  sets,
} = schema;

function envDir(name: string, fallback: string) {
  const v = process.env[name]?.trim();

  return v && v.length > 0 ? v : fallback;
}

async function fileExists(path: string) {
  try {
    await access(path);

    return true;
  } catch {
    return false;
  }
}

function parseBool(raw: string | undefined) {
  const v = raw?.trim().toLowerCase();

  return v === "true" || v === "1" || v === "t" || v === "yes";
}

function parseIntOpt(raw: string | undefined) {
  if (raw === undefined || raw === "") {
    return null;
  }

  const n = Number.parseInt(raw, 10);

  return Number.isFinite(n) ? n : null;
}

function openDb() {
  const databasePath = envDir("REBRICKABLE_DB_PATH", join(process.cwd(), "data", "rebrickable.db"));

  mkdirSync(join(databasePath, ".."), { recursive: true });

  const sqlite = new Database(databasePath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");

  return { sqlite, db: drizzle(sqlite, { schema }), databasePath };
}

async function* iterGzipCsv(path: string): AsyncGenerator<Record<string, string>> {
  const parser = parse({
    columns: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  });

  createReadStream(path).pipe(createGunzip()).pipe(parser);

  for await (const row of parser) {
    yield row as Record<string, string>;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }

  return out;
}

async function loadThemes(assetDir: string) {
  const path = join(assetDir, "themes.csv.gz");

  if (!(await fileExists(path))) {
    console.warn("[sync] 未找到 themes.csv.gz，跳过主题名称解析。");

    return new Map<number, string>();
  }

  const map = new Map<number, string>();

  for await (const row of iterGzipCsv(path)) {
    map.set(Number.parseInt(row.id, 10), row.name);
  }

  console.log(`[sync] themes ${map.size} 条`);

  return map;
}

async function loadSetsCsvIndex(assetDir: string) {
  const path = join(assetDir, "sets.csv.gz");

  if (!(await fileExists(path))) {
    console.warn("[sync] 未找到 sets.csv.gz，将仅用 inventories 中的套装编号生成占位套装记录。");

    return new Map<string, Record<string, string>>();
  }

  const map = new Map<string, Record<string, string>>();

  for await (const row of iterGzipCsv(path)) {
    map.set(row.set_num, row);
  }

  console.log(`[sync] sets.csv ${map.size} 条`);

  return map;
}

async function computeWinningInventoryMaps(assetDir: string) {
  const invPath = join(assetDir, "inventories.csv.gz");
  const best = new Map<string, { version: number; id: number }>();

  for await (const row of iterGzipCsv(invPath)) {
    const id = Number.parseInt(row.id, 10);
    const version = Number.parseInt(row.version, 10);
    const setNum = row.set_num;
    const cur = best.get(setNum);

    if (!cur || version > cur.version) {
      best.set(setNum, { version, id });
    }
  }

  const inventoryIdToSetNum = new Map<number, string>();

  for (const [setNum, { id }] of best) {
    inventoryIdToSetNum.set(id, setNum);
  }

  console.log(
    `[sync] inventories：${best.size} 个套装，选用最高 version 的清单 id（共 ${inventoryIdToSetNum.size} 条映射）。`,
  );

  return { bestBySetNum: best, winningInventoryIds: new Set(inventoryIdToSetNum.keys()), inventoryIdToSetNum };
}

async function main() {
  const assetDir = envDir("ASSETS_DIR", join(process.cwd(), "assets"));

  const required = ["colors.csv.gz", "part_categories.csv.gz", "parts.csv.gz", "inventories.csv.gz", "inventory_parts.csv.gz"];

  for (const name of required) {
    const p = join(assetDir, name);

    if (!(await fileExists(p))) {
      console.error(`缺少必需文件：${p}`);

      process.exit(1);
    }
  }

  const { sqlite, db, databasePath } = openDb();
  const now = new Date();

  console.log(`[sync] 数据库 ${databasePath}`);
  console.log(`[sync] 资源目录 ${assetDir}`);

  const themeNames = await loadThemes(assetDir);
  const setsByNum = await loadSetsCsvIndex(assetDir);
  const { winningInventoryIds, bestBySetNum, inventoryIdToSetNum } =
    await computeWinningInventoryMaps(assetDir);

  console.log("[sync] 写入 part_categories …");

  for await (const row of iterGzipCsv(join(assetDir, "part_categories.csv.gz"))) {
    const id = Number.parseInt(row.id, 10);

    db.insert(partCategories)
      .values({
        id,
        name: row.name,
        rawJson: JSON.stringify(row),
        downloadedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: partCategories.id,
        set: {
          name: row.name,
          rawJson: JSON.stringify(row),
          downloadedAt: now,
          updatedAt: now,
        },
      })
      .run();
  }

  const categoryNames = db.select({ id: partCategories.id, name: partCategories.name }).from(partCategories).all();
  const catMap = new Map(categoryNames.map((c) => [c.id, c.name]));

  console.log("[sync] 写入 colors …");

  for await (const row of iterGzipCsv(join(assetDir, "colors.csv.gz"))) {
    const id = Number.parseInt(row.id, 10);

    db.insert(colors)
      .values({
        id,
        name: row.name,
        rgb: row.rgb || null,
        isTransparent: parseBool(row.is_trans),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: colors.id,
        set: {
          name: row.name,
          rgb: row.rgb || null,
          isTransparent: parseBool(row.is_trans),
          updatedAt: now,
        },
      })
      .run();
  }

  console.log("[sync] 写入 parts …");

  for await (const row of iterGzipCsv(join(assetDir, "parts.csv.gz"))) {
    const partCatId = parseIntOpt(row.part_cat_id);

    db.insert(parts)
      .values({
        partNum: row.part_num,
        name: row.name,
        categoryId: partCatId,
        categoryName: partCatId === null ? null : (catMap.get(partCatId) ?? null),
        rawJson: JSON.stringify({
          part_cat_id: partCatId,
          part_material: row.part_material ?? null,
          source: "assets_csv",
        }),
        downloadedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: parts.partNum,
        set: {
          name: row.name,
          categoryId: partCatId,
          categoryName: partCatId === null ? null : (catMap.get(partCatId) ?? null),
          rawJson: JSON.stringify({
            part_cat_id: partCatId,
            part_material: row.part_material ?? null,
            source: "assets_csv",
          }),
          downloadedAt: now,
          updatedAt: now,
        },
      })
      .run();
  }

  console.log("[sync] 写入 sets …");

  for (const setNum of bestBySetNum.keys()) {
    const csvRow = setsByNum.get(setNum);
    const themeId = csvRow ? parseIntOpt(csvRow.theme_id) : null;

    const name = csvRow?.name?.trim() || setNum;
    const year = csvRow ? parseIntOpt(csvRow.year) : null;
    const numParts = csvRow ? parseIntOpt(csvRow.num_parts) : null;
    const themeName =
      themeId !== null && themeId !== undefined ? (themeNames.get(themeId) ?? null) : null;
    const imageUrl =
      csvRow?.img_url?.trim() ||
      csvRow?.set_img_url?.trim() ||
      csvRow?.image_url?.trim() ||
      null;
    const rebrickableUrl = csvRow?.set_url?.trim() || null;

    db.insert(sets)
      .values({
        setNum,
        name,
        year,
        themeId,
        themeName,
        numParts,
        imageUrl,
        rebrickableUrl,
        rawJson: csvRow ? JSON.stringify(csvRow) : JSON.stringify({ source: "assets_stub", set_num: setNum }),
        downloadedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: sets.setNum,
        set: {
          name,
          year,
          themeId,
          themeName,
          numParts,
          imageUrl,
          rebrickableUrl,
          rawJson: csvRow ? JSON.stringify(csvRow) : JSON.stringify({ source: "assets_stub", set_num: setNum }),
          downloadedAt: now,
          updatedAt: now,
        },
      })
      .run();
  }

  const syncedSetNums = [...bestBySetNum.keys()];

  console.log(`[sync] 清空旧清单：${syncedSetNums.length} 个套装的 set_parts …`);

  for (const group of chunk(syncedSetNums, 400)) {
    db.delete(setParts).where(inArray(setParts.setNum, group)).run();
  }

  console.log("[sync] 写入 inventory_parts → set_parts（流式）…");

  let inserted = 0;
  let skipped = 0;
  const batch: (typeof setParts.$inferInsert)[] = [];
  const flushBatch = () => {
    if (batch.length === 0) {
      return;
    }

    db.transaction((tx) => {
      for (const values of batch) {
        tx.insert(setParts)
          .values(values)
          .onConflictDoUpdate({
            target: [setParts.setNum, setParts.partNum, setParts.colorId, setParts.isSpare],
            set: {
              elementId: values.elementId,
              imageUrl: values.imageUrl,
              quantity: values.quantity,
              rawJson: values.rawJson,
              updatedAt: now,
            },
          })
          .run();
      }
    });

    batch.length = 0;
  };

  for await (const row of iterGzipCsv(join(assetDir, "inventory_parts.csv.gz"))) {
    const invId = Number.parseInt(row.inventory_id, 10);

    if (!winningInventoryIds.has(invId)) {
      skipped += 1;

      continue;
    }

    const setNum = inventoryIdToSetNum.get(invId);

    if (!setNum) {
      skipped += 1;

      continue;
    }

    const colorId = Number.parseInt(row.color_id, 10);
    const qty = Number.parseInt(row.quantity, 10);
    const isSpare = parseBool(row.is_spare);

    batch.push({
      setNum,
      partNum: row.part_num,
      colorId,
      elementId: null,
      imageUrl: row.img_url?.trim() || null,
      quantity: qty,
      isSpare,
      rawJson: JSON.stringify({
        inventory_id: invId,
        source: "assets_inventory_parts",
      }),
      createdAt: now,
      updatedAt: now,
    });

    inserted += 1;

    if (batch.length >= 1200) {
      flushBatch();

      if (inserted % 120000 === 0) {
        console.log(`[sync] … 已处理 ${inserted} 行`);
      }
    }
  }

  flushBatch();

  console.log(`[sync] set_parts 完成：写入 ${inserted} 行，跳过旧版本清单 ${skipped} 行。`);

  const elementsPath = join(assetDir, "elements.csv.gz");

  if (await fileExists(elementsPath)) {
    console.log("[sync] 聚合 elements → part_color_options …");

    type Group = { elements: string[] };
    const groups = new Map<string, Group>();

    for await (const row of iterGzipCsv(elementsPath)) {
      const partNum = row.part_num;
      const colorId = Number.parseInt(row.color_id, 10);
      const k = `${partNum}\x00${colorId}`;
      let g = groups.get(k);

      if (!g) {
        g = { elements: [] };
        groups.set(k, g);
      }

      g.elements.push(row.element_id);
    }

    let optUpserts = 0;

    for (const [k, g] of groups) {
      const [partNum, colorIdStr] = k.split("\x00");
      const colorId = Number.parseInt(colorIdStr, 10);
      const uniqueSorted = [...new Set(g.elements)].sort();

      db.insert(partColorOptions)
        .values({
          partNum,
          colorId,
          imageUrl: null,
          elementIds: JSON.stringify(uniqueSorted),
          numSets: null,
          rawJson: JSON.stringify({
            element_ids: uniqueSorted,
            source: "assets_elements",
          }),
          downloadedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [partColorOptions.partNum, partColorOptions.colorId],
          set: {
            elementIds: JSON.stringify(uniqueSorted),
            rawJson: JSON.stringify({
              element_ids: uniqueSorted,
              source: "assets_elements",
            }),
            downloadedAt: now,
            updatedAt: now,
          },
        })
        .run();

      optUpserts += 1;
    }

    console.log(`[sync] part_color_options 更新 ${optUpserts} 条（element 聚合）。`);
  } else {
    console.warn("[sync] 未找到 elements.csv.gz，跳过零件配色 element 聚合。");
  }

  const relPath = join(assetDir, "part_relationships.csv.gz");

  if (await fileExists(relPath)) {
    console.log("[sync] 替换 part_relationships …");

    sqlite.prepare("DELETE FROM part_relationships").run();

    let relCount = 0;
    const relBatch: (typeof partRelationships.$inferInsert)[] = [];
    const flushRel = () => {
      if (relBatch.length === 0) {
        return;
      }

      db.insert(partRelationships).values(relBatch).run();
      relCount += relBatch.length;
      relBatch.length = 0;
    };

    for await (const row of iterGzipCsv(relPath)) {
      relBatch.push({
        relType: row.rel_type,
        childPartNum: row.child_part_num,
        parentPartNum: row.parent_part_num,
        createdAt: now,
        updatedAt: now,
      });

      if (relBatch.length >= 2000) {
        flushRel();
      }
    }

    flushRel();
    console.log(`[sync] part_relationships ${relCount} 条。`);
  }

  sqlite.close();

  console.log("[sync] 全部完成。");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
