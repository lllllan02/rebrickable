import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";

import { catalogDbPath, userDbPath } from "./db-paths";
import { ensureCatalogLegacyCompatibility } from "./ensure-catalog-compat";
import { ensureUserBuildTables } from "./ensure-user-build-tables";
import { migrateLegacyBuildDataFromCatalogDb } from "./migrate-legacy-build-to-user-db";
import { catalogSchema, userSchema } from "./schema-registry";

function openCatalogSqlite(): Database.Database {
  const dbPath = catalogDbPath();
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `未找到目录库 ${dbPath}。请先运行：pnpm db:import（需 assets/*.csv.gz），或从 data/rebrickable.db.gz 解压后再试。`
    );
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  ensureCatalogLegacyCompatibility(sqlite);
  return sqlite;
}

function openUserSqlite(catalogSqlite: Database.Database): Database.Database {
  const resolved = path.resolve(userDbPath());
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  migrateLegacyBuildDataFromCatalogDb(catalogSqlite, resolved);
  const sqlite = new Database(resolved);
  sqlite.pragma("journal_mode = WAL");
  ensureUserBuildTables(sqlite);
  return sqlite;
}

const globalForDb = globalThis as typeof globalThis & {
  __catalogSqlite?: Database.Database;
  __userSqlite?: Database.Database;
  __catalogDb?: ReturnType<typeof drizzle<typeof catalogSchema>>;
  __userDb?: ReturnType<typeof drizzle<typeof userSchema>>;
};

export function getCatalogDb() {
  if (!globalForDb.__catalogDb) {
    const sqlite = openCatalogSqlite();
    globalForDb.__catalogSqlite = sqlite;
    globalForDb.__catalogDb = drizzle(sqlite, { schema: catalogSchema });
  }
  return globalForDb.__catalogDb;
}

export function getUserDb() {
  if (!globalForDb.__userDb) {
    const cat = globalForDb.__catalogSqlite ?? openCatalogSqlite();
    if (!globalForDb.__catalogSqlite) {
      globalForDb.__catalogSqlite = cat;
    }
    const userSqlite = openUserSqlite(cat);
    globalForDb.__userSqlite = userSqlite;
    globalForDb.__userDb = drizzle(userSqlite, { schema: userSchema });
  }
  return globalForDb.__userDb;
}

export type CatalogDb = ReturnType<typeof getCatalogDb>;
export type UserDb = ReturnType<typeof getUserDb>;
