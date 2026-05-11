/**
 * 将 data/rebrickable.db 压缩为 data/rebrickable.db.gz，便于提交到 Git（体积低于 GitHub 单文件上限）。
 * 用法：pnpm db:pack
 *
 * 打包前对 WAL 做 FULL checkpoint，把尚未合并进主文件的写入（含 MOC / build_*）写回 rebrickable.db；
 * 若仅流式读取主文件而不 checkpoint，压缩包会缺数据。打包时请关闭占用该库的 dev 服务以免 SQLITE_BUSY。
 */
import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";
import Database from "better-sqlite3";

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "rebrickable.db");
const GZ_PATH = path.join(ROOT, "data", "rebrickable.db.gz");

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

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`缺少 ${DB_PATH}，请先 pnpm db:import 或从备份恢复数据库。`);
    process.exit(1);
  }
  try {
    checkpointWalForPack(DB_PATH);
  } catch (e) {
    console.error(
      "[pack-local-db] WAL checkpoint 失败（请关闭 next dev 等占用该库的进程后重试）:",
      e,
    );
    process.exit(1);
  }
  const tmp = `${GZ_PATH}.tmp`;
  await pipeline(createReadStream(DB_PATH), createGzip({ level: 9 }), createWriteStream(tmp));
  await fs.promises.rename(tmp, GZ_PATH);
  console.log(`已写入 ${GZ_PATH}（可 git add 后提交）`);
}

main().catch((err) => {
  console.error("[pack-local-db]", err);
  process.exit(1);
});
