import Database from "better-sqlite3";

import { catalogDbPath } from "@/db/db-paths";

const globalForCatalog = globalThis as typeof globalThis & {
  __readonlyCatalogSqlite?: Database.Database;
};

/** 进程内单例：只读打开本地 catalog.db（BOM 对照、IO element 查询等共用）。 */
export function getReadonlyCatalogSqlite(): Database.Database {
  if (!globalForCatalog.__readonlyCatalogSqlite) {
    globalForCatalog.__readonlyCatalogSqlite = new Database(catalogDbPath(), {
      readonly: true,
      fileMustExist: true,
    });
  }
  return globalForCatalog.__readonlyCatalogSqlite;
}
