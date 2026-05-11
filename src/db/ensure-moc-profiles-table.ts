import type Database from "better-sqlite3";

export function ensureMocProfilesTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS moc_profiles (
      moc_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      profile_updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS moc_profiles_updated_idx ON moc_profiles(profile_updated_at);
  `);
}
