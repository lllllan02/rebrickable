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

export const db = drizzle(sqlite, { schema });
export const dbPath = databasePath;
