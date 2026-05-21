import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import Database from "better-sqlite3";

import { userDbGzPath, userDbPath } from "@/db/db-paths";
import { ensureUserBuildTables } from "@/db/ensure-user-build-tables";

function checkpointWalForPack(dbPath: string) {
  const db = new Database(dbPath);
  try {
    const mode = db.pragma("journal_mode", { simple: true }) as string;
    if (mode.toLowerCase() === "wal") {
      db.pragma("wal_checkpoint(FULL)");
    }
  } finally {
    db.close();
  }
}

async function gzipFile(src: string, dest: string) {
  const tmp = `${dest}.tmp`;
  await pipeline(createReadStream(src), createGzip({ level: 9 }), createWriteStream(tmp));
  await fs.promises.rename(tmp, dest);
}

export type PackUserDataResult =
  | { ok: true; gzPath: string; gzBytes: number; dbBytes: number }
  | { ok: false; error: string };

/**
 * 与 `pnpm db:pack` / `make pack` 一致：WAL checkpoint 后压缩用户库为 `.gz`。
 */
export async function packUserData(cwd = process.cwd()): Promise<PackUserDataResult> {
  const dbPath = userDbPath(cwd);
  const gzPath = userDbGzPath(cwd);

  try {
    if (!fs.existsSync(dbPath)) {
      await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
      const u = new Database(dbPath);
      u.pragma("journal_mode = WAL");
      ensureUserBuildTables(u, cwd);
      u.close();
    }
    checkpointWalForPack(dbPath);
    await gzipFile(dbPath, gzPath);
    const [dbStat, gzStat] = await Promise.all([
      fs.promises.stat(dbPath),
      fs.promises.stat(gzPath),
    ]);
    return {
      ok: true,
      gzPath,
      gzBytes: gzStat.size,
      dbBytes: dbStat.size,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/SQLITE_BUSY|database is locked/i.test(msg)) {
      return {
        ok: false,
        error: "用户库正被占用（请先停止 dev 服务或其它占用 SQLite 的进程），再重试打包。",
      };
    }
    return { ok: false, error: msg || "打包失败。" };
  }
}
