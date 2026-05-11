import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";

import { ensureMocImagesTable } from "./ensure-moc-images-table";
import { ensureMocProfilesTable } from "./ensure-moc-profiles-table";
import { ensureMocSavedPartsSheetTable } from "./ensure-moc-saved-parts-sheet-table";
import * as schema from "./schema";

const dbPath = path.join(process.cwd(), "data", "rebrickable.db");

function openDb() {
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `未找到数据库 ${dbPath}。请先运行：pnpm db:import（需 assets/*.csv.gz）`
    );
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  ensureMocSavedPartsSheetTable(sqlite);
  ensureMocImagesTable(sqlite);
  ensureMocProfilesTable(sqlite);
  return drizzle(sqlite, { schema });
}

const globalForDb = globalThis as typeof globalThis & {
  __rebrickableDb?: ReturnType<typeof openDb>;
};

export function getDb() {
  if (process.env.NODE_ENV !== "production") {
    if (!globalForDb.__rebrickableDb) {
      globalForDb.__rebrickableDb = openDb();
    }
    return globalForDb.__rebrickableDb;
  }
  return openDb();
}

export type Db = ReturnType<typeof getDb>;
