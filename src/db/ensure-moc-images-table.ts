import type Database from "better-sqlite3";

export function ensureMocImagesTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS moc_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      moc_id TEXT NOT NULL,
      stored_file TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (stored_file)
    );
    CREATE INDEX IF NOT EXISTS moc_images_moc_idx ON moc_images(moc_id);
  `);
}
