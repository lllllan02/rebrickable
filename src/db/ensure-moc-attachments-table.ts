import type Database from "better-sqlite3";

export function ensureMocAttachmentsTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS moc_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      moc_id TEXT NOT NULL,
      stored_file TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (stored_file)
    );
    CREATE INDEX IF NOT EXISTS moc_attachments_moc_idx ON moc_attachments(moc_id);
  `);
}
