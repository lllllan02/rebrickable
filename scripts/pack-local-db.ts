/**
 * 默认：仅将 data/rebrickable-user.db 压缩为 data/rebrickable-user.db.gz（收藏 / 零件表等用户数据，体积远小于全库）。
 * 全量目录库打包（~60MB+）：pnpm db:pack-catalog
 *
 * 打包前对 WAL 做 FULL checkpoint；请关闭占用对应库的 dev 服务以免 SQLITE_BUSY。
 */
import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import Database from "better-sqlite3";

import { catalogDbGzPath, catalogDbPath } from "../src/db/db-paths";
import { packUserData } from "../src/lib/pack-user-data";

const ROOT = path.join(__dirname, "..");

const packCatalog = process.argv.includes("--catalog");

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

async function main() {
  if (packCatalog) {
    const dbPath = catalogDbPath(ROOT);
    const gzPath = catalogDbGzPath(ROOT);
    if (!fs.existsSync(dbPath)) {
      console.error(`缺少 ${dbPath}，请先 pnpm db:import 或从备份恢复目录库。`);
      process.exit(1);
    }
    try {
      checkpointWalForPack(dbPath);
    } catch (e) {
      console.error(
        "[pack-local-db] 目录库 WAL checkpoint 失败（请关闭 next dev 等占用该库的进程后重试）:",
        e
      );
      process.exit(1);
    }
    await gzipFile(dbPath, gzPath);
    console.log(`已写入目录库压缩包 ${gzPath}`);
    return;
  }

  const res = await packUserData(ROOT);
  if (!res.ok) {
    console.error("[pack-local-db]", res.error);
    process.exit(1);
  }
  console.log(
    `已写入用户库压缩包 ${res.gzPath}（提交此文件即可同步收藏等，无需反复提交 rebrickable.db.gz）`
  );
}

main().catch((err) => {
  console.error("[pack-local-db]", err);
  process.exit(1);
});
