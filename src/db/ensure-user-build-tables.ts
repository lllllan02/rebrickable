import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";

import { parseStoredMocDualSheets } from "@/lib/parts-sheet-moc-id";

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite
    .prepare(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { x: number } | undefined;
  return Boolean(row);
}

function tableColumnNames(sqlite: Database.Database, table: string): Set<string> {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
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
 * 用户侧库 `rebrickable-user.db`：build_*、自 moc_* 迁移、删 moc_*、上传目录迁移。
 */
export function ensureUserBuildTables(sqlite: Database.Database, cwd = process.cwd()) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS build_saved_parts_sheets (
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      skipped_header INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      line_count INTEGER NOT NULL,
      total_part_qty INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      first_saved_at TEXT,
      shortage_line_count INTEGER,
      shortage_total_qty INTEGER,
      shortage_stats_ok INTEGER NOT NULL DEFAULT 0,
      shortage_cleared_at TEXT,
      gobricks_shortage_sync_at TEXT,
      gobricks_gds_price_cny REAL,
      PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS build_saved_parts_updated_idx ON build_saved_parts_sheets(updated_at);

    CREATE TABLE IF NOT EXISTS build_profiles (
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL,
      profile_updated_at TEXT NOT NULL,
      has_instructions_pdf INTEGER NOT NULL DEFAULT 0,
      has_io_source INTEGER NOT NULL DEFAULT 0,
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
      quantity INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS build_owned_kind_idx ON build_owned_subjects(subject_kind);

    CREATE TABLE IF NOT EXISTS build_favorite_subjects (
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      marked_at TEXT NOT NULL,
      PRIMARY KEY (subject_kind, subject_id)
    );
    CREATE INDEX IF NOT EXISTS build_favorite_kind_idx ON build_favorite_subjects(subject_kind);
  `);

  if (tableExists(sqlite, "build_owned_subjects")) {
    const cols = tableColumnNames(sqlite, "build_owned_subjects");
    if (!cols.has("quantity")) {
      sqlite.exec(
        `ALTER TABLE build_owned_subjects ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1`
      );
    }
  }

  if (tableExists(sqlite, "build_profiles")) {
    const profCols = tableColumnNames(sqlite, "build_profiles");
    if (!profCols.has("has_instructions_pdf")) {
      sqlite.exec(
        `ALTER TABLE build_profiles ADD COLUMN has_instructions_pdf INTEGER NOT NULL DEFAULT 0`
      );
    }
    if (!profCols.has("has_io_source")) {
      sqlite.exec(`ALTER TABLE build_profiles ADD COLUMN has_io_source INTEGER NOT NULL DEFAULT 0`);
    }
  }

  if (tableExists(sqlite, "moc_saved_parts_sheets")) {
    sqlite.exec(`
      INSERT OR IGNORE INTO build_saved_parts_sheets (
        subject_kind, subject_id, skipped_header, payload_json, line_count, total_part_qty, updated_at
      )
      SELECT 'moc', moc_id, skipped_header, payload_json, line_count, total_part_qty, updated_at
      FROM moc_saved_parts_sheets;
    `);
  }

  if (tableExists(sqlite, "build_saved_parts_sheets")) {
    const sheetCols = tableColumnNames(sqlite, "build_saved_parts_sheets");
    if (!sheetCols.has("shortage_line_count")) {
      sqlite.exec(`ALTER TABLE build_saved_parts_sheets ADD COLUMN shortage_line_count INTEGER`);
    }
    if (!sheetCols.has("shortage_total_qty")) {
      sqlite.exec(`ALTER TABLE build_saved_parts_sheets ADD COLUMN shortage_total_qty INTEGER`);
    }
    if (!sheetCols.has("shortage_stats_ok")) {
      sqlite.exec(
        `ALTER TABLE build_saved_parts_sheets ADD COLUMN shortage_stats_ok INTEGER NOT NULL DEFAULT 0`
      );
    }
    if (!sheetCols.has("shortage_cleared_at")) {
      sqlite.exec(`ALTER TABLE build_saved_parts_sheets ADD COLUMN shortage_cleared_at TEXT`);
    }
    if (!sheetCols.has("first_saved_at")) {
      sqlite.exec(`ALTER TABLE build_saved_parts_sheets ADD COLUMN first_saved_at TEXT`);
    }
    if (!sheetCols.has("gobricks_shortage_sync_at")) {
      sqlite.exec(`ALTER TABLE build_saved_parts_sheets ADD COLUMN gobricks_shortage_sync_at TEXT`);
    }
    if (!sheetCols.has("gobricks_gds_price_cny")) {
      sqlite.exec(`ALTER TABLE build_saved_parts_sheets ADD COLUMN gobricks_gds_price_cny REAL`);
    }
    sqlite.exec(
      `UPDATE build_saved_parts_sheets SET first_saved_at = updated_at WHERE first_saved_at IS NULL OR trim(first_saved_at) = ''`
    );

    const pending = sqlite
      .prepare(
        `SELECT subject_kind AS subjectKind, subject_id AS subjectId, payload_json AS payloadJson
         FROM build_saved_parts_sheets WHERE shortage_stats_ok = 0`
      )
      .all() as { subjectKind: string; subjectId: string; payloadJson: string }[];

    if (pending.length > 0) {
      const upd = sqlite.prepare(
        `UPDATE build_saved_parts_sheets
         SET shortage_line_count = @shortageLineCount,
             shortage_total_qty = @shortageTotalQty,
             shortage_stats_ok = 1
         WHERE subject_kind = @subjectKind AND subject_id = @subjectId`
      );
      for (const row of pending) {
        let shortageLineCount: number | null = null;
        let shortageTotalQty: number | null = null;
        try {
          const dual = parseStoredMocDualSheets(JSON.parse(row.payloadJson) as unknown);
          if (dual?.shortage?.items?.length) {
            shortageLineCount = dual.shortage.items.length;
            let sum = 0;
            for (const it of dual.shortage.items) {
              if (Number.isFinite(it.quantity)) sum += it.quantity;
            }
            shortageTotalQty = sum;
          }
        } catch {
          /* 保持 null，仍标记已处理以免反复失败 */
        }
        upd.run({
          shortageLineCount,
          shortageTotalQty,
          subjectKind: row.subjectKind,
          subjectId: row.subjectId,
        });
      }
    }
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

  if (tableExists(sqlite, "build_profiles") && tableExists(sqlite, "build_attachments")) {
    sqlite.exec(`
      UPDATE build_profiles SET
        has_instructions_pdf = (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM build_attachments ba
            WHERE ba.subject_kind = build_profiles.subject_kind
              AND ba.subject_id = build_profiles.subject_id
              AND lower(ba.stored_file) GLOB '*.pdf'
          ) THEN 1 ELSE 0 END
        ),
        has_io_source = (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM build_attachments ba
            WHERE ba.subject_kind = build_profiles.subject_kind
              AND ba.subject_id = build_profiles.subject_id
              AND lower(ba.stored_file) GLOB '*.io'
          ) THEN 1 ELSE 0 END
        );
    `);
    sqlite.exec(`
      INSERT OR IGNORE INTO build_profiles (
        subject_kind, subject_id, display_name, tags_json, profile_updated_at,
        has_instructions_pdf, has_io_source
      )
      SELECT
        a.subject_kind,
        a.subject_id,
        '',
        '[]',
        datetime('now'),
        MAX(CASE WHEN lower(a.stored_file) GLOB '*.pdf' THEN 1 ELSE 0 END),
        MAX(CASE WHEN lower(a.stored_file) GLOB '*.io' THEN 1 ELSE 0 END)
      FROM build_attachments a
      GROUP BY a.subject_kind, a.subject_id;
    `);
  }

  sqlite.exec(`
    DROP TABLE IF EXISTS moc_attachments;
    DROP TABLE IF EXISTS moc_images;
    DROP TABLE IF EXISTS moc_saved_parts_sheets;
    DROP TABLE IF EXISTS moc_profiles;
  `);
}
