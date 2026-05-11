/**
 * 若仓库中存在 data/rebrickable.db.gz，则在本地生成/更新 data/rebrickable.db。
 * 由 postinstall 调用：clone 后 pnpm install 即可得到可用数据库，无需手動解压。
 *
 * 跳过条件：无 .gz；或已有 .db 且不比 .gz 旧（保留本机较新的库）。
 */
import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "rebrickable.db");
const GZ_PATH = path.join(ROOT, "data", "rebrickable.db.gz");

async function main() {
  if (process.env.SKIP_LOCAL_DB_UNPACK === "1") return;
  if (!fs.existsSync(GZ_PATH)) return;

  if (fs.existsSync(DB_PATH)) {
    const dbM = fs.statSync(DB_PATH).mtimeMs;
    const gzM = fs.statSync(GZ_PATH).mtimeMs;
    if (dbM >= gzM) return;
  }

  await fs.promises.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  await pipeline(createReadStream(GZ_PATH), createGunzip(), createWriteStream(tmp));
  await fs.promises.rename(tmp, DB_PATH);
}

main().catch((err) => {
  console.error("[ensure-local-db]", err);
  process.exit(1);
});
