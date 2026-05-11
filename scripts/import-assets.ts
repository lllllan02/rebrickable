/**
 * 从 assets/*.csv.gz 构建本地 SQLite（与 Drizzle schema 一致）。
 * 用法：pnpm db:import
 */
import fs from "fs";
import path from "path";
import { createReadStream } from "fs";
import { createGunzip } from "zlib";
import { parse } from "csv-parse";
import Database from "better-sqlite3";

import { ensureMocImagesTable } from "../src/db/ensure-moc-images-table";
import { ensureMocProfilesTable } from "../src/db/ensure-moc-profiles-table";
import { ensureMocSavedPartsSheetTable } from "../src/db/ensure-moc-saved-parts-sheet-table";

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "assets");
const DB_PATH = path.join(ROOT, "data", "rebrickable.db");

const BATCH = 8000;

function boolFromCsv(v: string | undefined): number {
  const s = (v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" ? 1 : 0;
}

function intOrNull(v: string | undefined): number | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function intReq(v: string | undefined): number {
  const n = Number((v ?? "").trim());
  if (!Number.isFinite(n)) throw new Error(`无效整数: ${JSON.stringify(v)}`);
  return n;
}

function textOrNull(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

function textReq(v: string | undefined): string {
  const t = (v ?? "").trim();
  if (t === "") throw new Error("空字符串");
  return t;
}

async function* readGzCsv(file: string) {
  const full = path.join(ASSETS, file);
  if (!fs.existsSync(full)) {
    throw new Error(`缺少文件: ${full}`);
  }
  const parser = createReadStream(full)
    .pipe(createGunzip())
    .pipe(parse({ columns: true, relax_quotes: true, trim: true }));
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    yield row;
  }
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS inventory_parts;
    DROP TABLE IF EXISTS part_relationships;
    DROP TABLE IF EXISTS elements;
    DROP TABLE IF EXISTS inventories;
    DROP TABLE IF EXISTS sets;
    DROP TABLE IF EXISTS parts;
    DROP TABLE IF EXISTS part_categories;
    DROP TABLE IF EXISTS colors;

    CREATE TABLE colors (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      rgb TEXT NOT NULL,
      is_trans INTEGER NOT NULL,
      num_parts INTEGER,
      num_sets INTEGER,
      y1 INTEGER,
      y2 INTEGER
    );

    CREATE TABLE part_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE parts (
      part_num TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      part_cat_id INTEGER REFERENCES part_categories(id),
      part_material TEXT
    );
    CREATE INDEX parts_name_idx ON parts(name);
    CREATE INDEX parts_cat_idx ON parts(part_cat_id);

    CREATE TABLE elements (
      element_id TEXT PRIMARY KEY,
      part_num TEXT NOT NULL REFERENCES parts(part_num),
      color_id INTEGER NOT NULL REFERENCES colors(id),
      design_id TEXT
    );
    CREATE INDEX elements_part_idx ON elements(part_num);

    CREATE TABLE sets (
      set_num TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      year INTEGER,
      theme_id INTEGER,
      num_parts INTEGER,
      img_url TEXT
    );
    CREATE INDEX sets_name_idx ON sets(name);

    CREATE TABLE inventories (
      id INTEGER PRIMARY KEY,
      version INTEGER NOT NULL,
      set_num TEXT NOT NULL
    );
    CREATE INDEX inventories_set_num_idx ON inventories(set_num);

    CREATE TABLE inventory_parts (
      inventory_id INTEGER NOT NULL REFERENCES inventories(id),
      part_num TEXT NOT NULL REFERENCES parts(part_num),
      color_id INTEGER NOT NULL REFERENCES colors(id),
      quantity INTEGER NOT NULL,
      is_spare INTEGER NOT NULL,
      img_url TEXT,
      PRIMARY KEY (inventory_id, part_num, color_id, is_spare)
    );
    CREATE INDEX ip_inventory_idx ON inventory_parts(inventory_id);
    CREATE INDEX ip_part_idx ON inventory_parts(part_num);

    CREATE TABLE part_relationships (
      rel_type TEXT NOT NULL,
      child_part_num TEXT NOT NULL REFERENCES parts(part_num),
      parent_part_num TEXT NOT NULL REFERENCES parts(part_num),
      PRIMARY KEY (rel_type, child_part_num, parent_part_num)
    );
    CREATE INDEX pr_parent_idx ON part_relationships(parent_part_num);
    CREATE INDEX pr_child_idx ON part_relationships(child_part_num);
  `);
  ensureMocSavedPartsSheetTable(db);
  ensureMocImagesTable(db);
  ensureMocProfilesTable(db);
}

async function loadPartCategories(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO part_categories (id, name) VALUES (?, ?)`
  );
  const tx = db.transaction((rows: [number, string][]) => {
    for (const r of rows) ins.run(r[0], r[1]);
  });
  const buf: [number, string][] = [];
  for await (const row of readGzCsv("part_categories.csv.gz")) {
    buf.push([intReq(row.id), textReq(row.name)]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function loadColors(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO colors (id, name, rgb, is_trans, num_parts, num_sets, y1, y2)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(
    (
      rows: [
        number,
        string,
        string,
        number,
        number | null,
        number | null,
        number | null,
        number | null,
      ][]
    ) => {
      for (const r of rows) ins.run(...r);
    }
  );
  const buf: [
    number,
    string,
    string,
    number,
    number | null,
    number | null,
    number | null,
    number | null,
  ][] = [];
  for await (const row of readGzCsv("colors.csv.gz")) {
    buf.push([
      intReq(row.id),
      textReq(row.name),
      textReq(row.rgb),
      boolFromCsv(row.is_trans),
      intOrNull(row.num_parts),
      intOrNull(row.num_sets),
      intOrNull(row.y1),
      intOrNull(row.y2),
    ]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function loadParts(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO parts (part_num, name, part_cat_id, part_material)
     VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(
    (rows: [string, string, number | null, string | null][]) => {
      for (const r of rows) ins.run(...r);
    }
  );
  const buf: [string, string, number | null, string | null][] = [];
  for await (const row of readGzCsv("parts.csv.gz")) {
    buf.push([
      textReq(row.part_num),
      textReq(row.name),
      intOrNull(String(row.part_cat_id)),
      textOrNull(row.part_material),
    ]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function loadElements(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO elements (element_id, part_num, color_id, design_id)
     VALUES (?, ?, ?, ?)`
  );
  const tx = db.transaction(
    (rows: [string, string, number, string | null][]) => {
      for (const r of rows) ins.run(...r);
    }
  );
  const buf: [string, string, number, string | null][] = [];
  for await (const row of readGzCsv("elements.csv.gz")) {
    buf.push([
      textReq(row.element_id),
      textReq(row.part_num),
      intReq(row.color_id),
      textOrNull(row.design_id),
    ]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function loadSets(db: Database.Database) {
  const full = path.join(ASSETS, "sets.csv.gz");
  if (!fs.existsSync(full)) {
    console.warn(
      "未找到 assets/sets.csv.gz，已跳过；套装盒图需该文件（Rebrickable 下载页可获取）。"
    );
    return;
  }
  const ins = db.prepare(
    `INSERT INTO sets (set_num, name, year, theme_id, num_parts, img_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(
    (
      rows: [
        string,
        string,
        number | null,
        number | null,
        number | null,
        string | null,
      ][]
    ) => {
      for (const r of rows) ins.run(...r);
    }
  );
  const buf: [
    string,
    string,
    number | null,
    number | null,
    number | null,
    string | null,
  ][] = [];
  for await (const row of readGzCsv("sets.csv.gz")) {
    buf.push([
      textReq(row.set_num),
      textReq(row.name),
      intOrNull(row.year),
      intOrNull(row.theme_id),
      intOrNull(row.num_parts),
      textOrNull(row.img_url),
    ]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function loadInventories(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO inventories (id, version, set_num) VALUES (?, ?, ?)`
  );
  const tx = db.transaction((rows: [number, number, string][]) => {
    for (const r of rows) ins.run(...r);
  });
  const buf: [number, number, string][] = [];
  for await (const row of readGzCsv("inventories.csv.gz")) {
    buf.push([intReq(row.id), intReq(row.version), textReq(row.set_num)]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function loadInventoryParts(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO inventory_parts (inventory_id, part_num, color_id, quantity, is_spare, img_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const tx = db.transaction(
    (
      rows: [number, string, number, number, number, string | null][]
    ) => {
      for (const r of rows) ins.run(...r);
    }
  );
  const buf: [number, string, number, number, number, string | null][] = [];
  for await (const row of readGzCsv("inventory_parts.csv.gz")) {
    buf.push([
      intReq(row.inventory_id),
      textReq(row.part_num),
      intReq(row.color_id),
      intReq(row.quantity),
      boolFromCsv(row.is_spare),
      textOrNull(row.img_url),
    ]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function loadPartRelationships(db: Database.Database) {
  const ins = db.prepare(
    `INSERT INTO part_relationships (rel_type, child_part_num, parent_part_num)
     VALUES (?, ?, ?)`
  );
  const tx = db.transaction((rows: [string, string, string][]) => {
    for (const r of rows) ins.run(...r);
  });
  const buf: [string, string, string][] = [];
  for await (const row of readGzCsv("part_relationships.csv.gz")) {
    buf.push([
      textReq(row.rel_type),
      textReq(row.child_part_num),
      textReq(row.parent_part_num),
    ]);
    if (buf.length >= BATCH) {
      tx(buf);
      buf.length = 0;
    }
  }
  if (buf.length) tx(buf);
}

async function main() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = OFF");
  console.log("创建表结构…");
  ensureSchema(db);

  console.log("导入 part_categories…");
  await loadPartCategories(db);
  console.log("导入 colors…");
  await loadColors(db);
  console.log("导入 parts…");
  await loadParts(db);
  console.log("导入 elements…");
  await loadElements(db);
  console.log("导入 sets（套装元数据与盒图）…");
  await loadSets(db);
  console.log("导入 inventories…");
  await loadInventories(db);
  console.log("导入 inventory_parts（较慢）…");
  await loadInventoryParts(db);
  console.log("导入 part_relationships…");
  await loadPartRelationships(db);

  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.exec("ANALYZE");
  db.close();
  console.log(`完成：${DB_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
