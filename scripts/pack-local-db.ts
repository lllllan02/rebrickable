/**
 * 将 data/rebrickable.db 压缩为 data/rebrickable.db.gz，便于提交到 Git（体积低于 GitHub 单文件上限）。
 * 用法：pnpm db:pack
 */
import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import { pipeline } from "stream/promises";

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "rebrickable.db");
const GZ_PATH = path.join(ROOT, "data", "rebrickable.db.gz");

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`缺少 ${DB_PATH}，请先 pnpm db:import 或从备份恢复数据库。`);
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
