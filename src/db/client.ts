import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import * as schema from "./schema";

const databasePath =
  process.env.REBRICKABLE_DB_PATH ??
  join(process.cwd(), "data", "rebrickable.db");

mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");

const hasDownloadJobsTable = Boolean(
  sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'download_jobs'")
    .get(),
);

if (hasDownloadJobsTable) {
  const downloadJobColumns = sqlite
    .prepare("PRAGMA table_info(download_jobs)")
    .all()
    .map((column) => (column as { name: string }).name);

  for (const [name, type] of [
    ["progress_stage", "text"],
    ["progress_current", "integer"],
    ["progress_total", "integer"],
    ["progress_detail", "text"],
  ] as const) {
    if (!downloadJobColumns.includes(name)) {
      sqlite.exec(`ALTER TABLE download_jobs ADD COLUMN ${name} ${type}`);
    }
  }
}

export const db = drizzle(sqlite, { schema });
export const dbPath = databasePath;
