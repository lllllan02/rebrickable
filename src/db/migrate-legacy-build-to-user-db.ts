import Database from "better-sqlite3";

import { ensureUserBuildTables } from "./ensure-user-build-tables";

const BUILD_TABLES = [
  "build_saved_parts_sheets",
  "build_profiles",
  "build_images",
  "build_attachments",
  "build_owned_subjects",
  "build_favorite_subjects",
] as const;

function tableExists(sqlite: Database.Database, name: string): boolean {
  const row = sqlite
    .prepare(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name) as { x: number } | undefined;
  return Boolean(row);
}

function rowCount(sqlite: Database.Database, table: string): number {
  if (!tableExists(sqlite, table)) return 0;
  const row = sqlite.prepare(`SELECT count(*) AS c FROM ${table}`).get() as { c: number } | undefined;
  return Number(row?.c ?? 0);
}

function userDbHasAnyBuildRow(userSqlite: Database.Database): boolean {
  for (const t of BUILD_TABLES) {
    if (rowCount(userSqlite, t) > 0) return true;
  }
  return false;
}

function catalogHasMocLegacy(catalog: Database.Database): boolean {
  return (
    (tableExists(catalog, "moc_saved_parts_sheets") && rowCount(catalog, "moc_saved_parts_sheets") > 0) ||
    (tableExists(catalog, "moc_profiles") && rowCount(catalog, "moc_profiles") > 0) ||
    (tableExists(catalog, "moc_images") && rowCount(catalog, "moc_images") > 0) ||
    (tableExists(catalog, "moc_attachments") && rowCount(catalog, "moc_attachments") > 0)
  );
}

function catalogHasBuildOrMocLegacy(catalog: Database.Database): boolean {
  for (const t of BUILD_TABLES) {
    if (rowCount(catalog, t) > 0) return true;
  }
  return catalogHasMocLegacy(catalog);
}

function dropCatalogBuildAndMoc(catalog: Database.Database) {
  for (const t of BUILD_TABLES) {
    catalog.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  catalog.exec(`
    DROP TABLE IF EXISTS moc_attachments;
    DROP TABLE IF EXISTS moc_images;
    DROP TABLE IF EXISTS moc_saved_parts_sheets;
    DROP TABLE IF EXISTS moc_profiles;
  `);
}

function copyMocIntoAttachedUser(catalog: Database.Database) {
  if (tableExists(catalog, "moc_saved_parts_sheets") && rowCount(catalog, "moc_saved_parts_sheets") > 0) {
    catalog.exec(`
      INSERT OR IGNORE INTO udb.build_saved_parts_sheets (
        subject_kind, subject_id, skipped_header, payload_json, line_count, total_part_qty, updated_at
      )
      SELECT 'moc', moc_id, skipped_header, payload_json, line_count, total_part_qty, updated_at
      FROM main.moc_saved_parts_sheets;
    `);
  }
  if (tableExists(catalog, "moc_profiles") && rowCount(catalog, "moc_profiles") > 0) {
    catalog.exec(`
      INSERT OR IGNORE INTO udb.build_profiles (
        subject_kind, subject_id, display_name, tags_json, profile_updated_at
      )
      SELECT 'moc', moc_id, display_name, tags_json, profile_updated_at
      FROM main.moc_profiles;
    `);
  }
  if (tableExists(catalog, "moc_images") && rowCount(catalog, "moc_images") > 0) {
    catalog.exec(`
      INSERT OR IGNORE INTO udb.build_images (
        subject_kind, subject_id, stored_file, original_name, mime_type, byte_size, created_at
      )
      SELECT 'moc', moc_id, stored_file, original_name, mime_type, byte_size, created_at
      FROM main.moc_images;
    `);
  }
  if (tableExists(catalog, "moc_attachments") && rowCount(catalog, "moc_attachments") > 0) {
    catalog.exec(`
      INSERT OR IGNORE INTO udb.build_attachments (
        subject_kind, subject_id, stored_file, original_name, mime_type, byte_size, created_at
      )
      SELECT 'moc', moc_id, stored_file, original_name, mime_type, byte_size, created_at
      FROM main.moc_attachments;
    `);
  }
}

/**
 * 从旧版「单文件」目录库 main.* 迁出 build_* / moc_* 到 `rebrickable-user.db`。
 * 若用户库已有任意 build 行，则仅删除目录库上残留表，避免覆盖云端已同步数据。
 */
export function migrateLegacyBuildDataFromCatalogDb(
  catalogSqlite: Database.Database,
  userDbAbsolutePath: string,
  cwd = process.cwd()
) {
  if (!catalogHasBuildOrMocLegacy(catalogSqlite)) return;

  const userHasData = (() => {
    const u = new Database(userDbAbsolutePath);
    try {
      ensureUserBuildTables(u, cwd);
      return userDbHasAnyBuildRow(u);
    } finally {
      u.close();
    }
  })();

  if (userHasData) {
    dropCatalogBuildAndMoc(catalogSqlite);
    return;
  }

  const esc = userDbAbsolutePath.replace(/'/g, "''");
  catalogSqlite.exec(`ATTACH DATABASE '${esc}' AS udb`);
  try {
    catalogSqlite.exec("BEGIN IMMEDIATE");
    for (const t of BUILD_TABLES) {
      if (!tableExists(catalogSqlite, t)) continue;
      if (rowCount(catalogSqlite, t) === 0) continue;
      catalogSqlite.exec(`INSERT OR REPLACE INTO udb.${t} SELECT * FROM main.${t}`);
      catalogSqlite.exec(`DROP TABLE IF EXISTS main.${t}`);
    }
    copyMocIntoAttachedUser(catalogSqlite);
    dropCatalogBuildAndMoc(catalogSqlite);
    catalogSqlite.exec("COMMIT");
  } catch (e) {
    try {
      catalogSqlite.exec("ROLLBACK");
    } catch {
      /* */
    }
    throw e;
  } finally {
    try {
      catalogSqlite.exec("DETACH DATABASE udb");
    } catch {
      /* */
    }
  }

  const userAgain = new Database(userDbAbsolutePath);
  try {
    ensureUserBuildTables(userAgain, cwd);
  } finally {
    userAgain.close();
  }
}
