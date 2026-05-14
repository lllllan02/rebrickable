import path from "path";

export const CATALOG_DB_FILE = "rebrickable.db";
export const USER_DB_FILE = "rebrickable-user.db";

export const CATALOG_DB_GZ = "rebrickable.db.gz";
export const USER_DB_GZ = "rebrickable-user.db.gz";

export function catalogDbPath(cwd = process.cwd()): string {
  return path.join(cwd, "data", CATALOG_DB_FILE);
}

export function userDbPath(cwd = process.cwd()): string {
  return path.join(cwd, "data", USER_DB_FILE);
}

export function catalogDbGzPath(cwd = process.cwd()): string {
  return path.join(cwd, "data", CATALOG_DB_GZ);
}

export function userDbGzPath(cwd = process.cwd()): string {
  return path.join(cwd, "data", USER_DB_GZ);
}
