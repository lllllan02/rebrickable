import type Database from "better-sqlite3";

/** 与 Drizzle `mocSavedPartsSheets` 一致；IF NOT EXISTS 以便 `db:import` 全量重建时不丢用户数据 */
export function ensureMocSavedPartsSheetTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS moc_saved_parts_sheets (
      moc_id TEXT PRIMARY KEY,
      skipped_header INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS moc_saved_parts_updated_idx ON moc_saved_parts_sheets(updated_at);
  `);
}
