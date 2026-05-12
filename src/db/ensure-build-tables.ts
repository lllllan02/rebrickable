import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite
    .prepare(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { x: number } | undefined;
  return Boolean(row);
}

/** 将 `data/moc-uploads/<id>/` 迁到 `data/build-uploads/moc/<id>/`（仅当目标尚不存在） */
function migrateLegacyMocUploadDirs(cwd: string) {
  const legacyRoot = path.join(cwd, "data", "moc-uploads");
  const nextRoot = path.join(cwd, "data", "build-uploads", "moc");
  if (!fs.existsSync(legacyRoot)) return;
  fs.mkdirSync(nextRoot, { recursive: true });
  for (const name of fs.readdirSync(legacyRoot)) {
    if (name === "." || name === "..") continue;
    const from = path.join(legacyRoot, name);
    if (!fs.statSync(from).isDirectory()) continue;
    const to = path.join(nextRoot, name);
    if (fs.existsSync(to)) continue;
    fs.renameSync(from, to);
  }
  try {
    const left = fs.readdirSync(legacyRoot);
    if (left.length === 0) fs.rmdirSync(legacyRoot);
  } catch {
    /* 非空或并发则保留 */
  }
}

/**
 * 本地「套装 / MOC」共用表：创建 build_*、自 moc_* 迁移数据、删 moc_*、迁移上传目录。
 * 不再保留 moc_* 表；无兼容读取。
 */
export function ensureBuildTables(sqlite: Database.Database, cwd = process.cwd()) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS build_saved_parts_sheets (
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      skipped_header INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      total_part_qty INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS build_saved_parts_updated_idx ON build_saved_parts_sheets(updated_at);

    CREATE TABLE IF NOT EXISTS build_profiles (
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL,
      profile_updated_at TEXT NOT NULL,
      PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS build_profiles_updated_idx ON build_profiles(profile_updated_at);

    CREATE TABLE IF NOT EXISTS build_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      stored_file TEXT NOT NULL UNIQUE,
      original_name TEXT,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS build_images_subject_idx ON build_images(subject_kind, subject_id);

    CREATE TABLE IF NOT EXISTS build_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      stored_file TEXT NOT NULL UNIQUE,
      original_name TEXT,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS build_attachments_subject_idx ON build_attachments(subject_kind, subject_id);

    CREATE TABLE IF NOT EXISTS build_owned_subjects (
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      marked_at TEXT NOT NULL,
      PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS build_owned_kind_idx ON build_owned_subjects(subject_kind);
  `);

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

  if (tableExists(sqlite, "moc_saved_parts_sheets")) {
    sqlite.exec(`
      INSERT OR IGNORE INTO build_saved_parts_sheets (
        subject_kind, subject_id, skipped_header, payload_json, line_count, total_part_qty, updated_at
      )
      SELECT 'moc', moc_id, skipped_header, payload_json, line_count, total_part_qty, updated_at
      FROM moc_saved_parts_sheets;
    `);
  }

  if (tableExists(sqlite, "moc_profiles")) {
    sqlite.exec(`
      INSERT OR IGNORE INTO build_profiles (
        subject_kind, subject_id, display_name, tags_json, profile_updated_at
      )
      SELECT 'moc', moc_id, display_name, tags_json, profile_updated_at
      FROM moc_profiles;
    `);
  }

  if (tableExists(sqlite, "moc_images")) {
    sqlite.exec(`
      INSERT OR IGNORE INTO build_images (
        subject_kind, subject_id, stored_file, original_name, mime_type, byte_size, created_at
      )
      SELECT 'moc', moc_id, stored_file, original_name, mime_type, byte_size, created_at
      FROM moc_images;
    `);
  }

  if (tableExists(sqlite, "moc_attachments")) {
    sqlite.exec(`
      INSERT OR IGNORE INTO build_attachments (
        subject_kind, subject_id, stored_file, original_name, mime_type, byte_size, created_at
      )
      SELECT 'moc', moc_id, stored_file, original_name, mime_type, byte_size, created_at
      FROM moc_attachments;
    `);
  }

  migrateLegacyMocUploadDirs(cwd);

  sqlite.exec(`
    DROP TABLE IF EXISTS moc_attachments;
    DROP TABLE IF EXISTS moc_images;
    DROP TABLE IF EXISTS moc_saved_parts_sheets;
    DROP TABLE IF EXISTS moc_profiles;
  `);
}
