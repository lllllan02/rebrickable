import type Database from "better-sqlite3";

/**
 * 极旧库可能缺 themes / minifigs / inventory_minifigs 结构（与 import 脚本 DDL 对齐）。
 * 仅应在「目录库」连接上调用；用户侧库不包含这些表。
 */
export function ensureCatalogLegacyCompatibility(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS themes_parent_idx ON themes(parent_id);

    CREATE TABLE IF NOT EXISTS minifigs (
      fig_num TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      num_parts INTEGER,
      img_url TEXT
    );
    CREATE INDEX IF NOT EXISTS minifigs_name_idx ON minifigs(name);

    CREATE TABLE IF NOT EXISTS inventory_minifigs (
      inventory_id INTEGER NOT NULL,
      fig_num TEXT NOT NULL REFERENCES minifigs(fig_num),
      quantity INTEGER NOT NULL,
      PRIMARY KEY (inventory_id, fig_num)
    );
    CREATE INDEX IF NOT EXISTS im_inv_idx ON inventory_minifigs(inventory_id);
    CREATE INDEX IF NOT EXISTS im_fig_idx ON inventory_minifigs(fig_num);
  `);
}
