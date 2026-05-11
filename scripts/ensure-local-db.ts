/**
 * 若仓库中存在 data/rebrickable.db.gz，则在本地生成/更新 data/rebrickable.db。
 * 由 postinstall 调用：clone 后 pnpm install 即可得到可用数据库，无需手動解压。
 *
 * 跳过条件：无 .gz；`pnpm db:import` 已写 `data/.rebrickable-db-from-import`；
 * 或已有 .db 且 `data/.rebrickable-db-from-gz.json` 与当前 .gz 一致（先比 size+mtime，再比 sha256）。
 *
 * 说明：不能仅用 .db 与 .gz 的 mtime 比较——Git 检出的 .gz 常带旧提交时间，
 * 本机 .db 因开发/WAL 反而更新，会误判为「本地已新」而跳过解压，导致拉不到仓库里的 MOC 等数据。
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "rebrickable.db");
const GZ_PATH = path.join(ROOT, "data", "rebrickable.db.gz");
const GZ_REF_PATH = path.join(ROOT, "data", ".rebrickable-db-from-gz.json");
const IMPORT_MARK_PATH = path.join(ROOT, "data", ".rebrickable-db-from-import");

type GzRef = { v: 1; sha256: string; gzSize: number; gzMtimeMs: number };

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

async function readGzRef(): Promise<GzRef | null> {
  try {
    const raw = await fs.promises.readFile(GZ_REF_PATH, "utf8");
    const j = JSON.parse(raw) as GzRef;
    if (j?.v === 1 && typeof j.sha256 === "string" && typeof j.gzSize === "number" && typeof j.gzMtimeMs === "number") {
      return j;
    }
  } catch {
    /* 无或损坏 */
  }
  return null;
}

async function main() {
  if (process.env.SKIP_LOCAL_DB_UNPACK === "1") return;
  if (!fs.existsSync(GZ_PATH)) return;
  if (fs.existsSync(IMPORT_MARK_PATH)) return;

  let gzStat: fs.Stats;
  try {
    gzStat = await fs.promises.stat(GZ_PATH);
  } catch (e) {
    console.error("[ensure-local-db] 无法 stat .gz", e);
    process.exit(1);
  }

  const dbOk = fs.existsSync(DB_PATH);
  const prevRef = await readGzRef();
  if (dbOk && prevRef && prevRef.gzSize === gzStat.size && prevRef.gzMtimeMs === gzStat.mtimeMs) {
    return;
  }

  let gzHash: string;
  try {
    gzHash = await sha256File(GZ_PATH);
  } catch (e) {
    console.error("[ensure-local-db] 无法读取 .gz 以计算校验和", e);
    process.exit(1);
  }

  if (dbOk && prevRef && prevRef.sha256 === gzHash) {
    await fs.promises.writeFile(
      GZ_REF_PATH,
      `${JSON.stringify({ v: 1 as const, sha256: gzHash, gzSize: gzStat.size, gzMtimeMs: gzStat.mtimeMs })}\n`,
      "utf8",
    );
    return;
  }

  await fs.promises.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  await pipeline(createReadStream(GZ_PATH), createGunzip(), createWriteStream(tmp));
  await fs.promises.rename(tmp, DB_PATH);
  try {
    await fs.promises.unlink(IMPORT_MARK_PATH);
  } catch {
    /* 不存在即可 */
  }
  const st = await fs.promises.stat(GZ_PATH);
  await fs.promises.writeFile(
    GZ_REF_PATH,
    `${JSON.stringify({ v: 1 as const, sha256: gzHash, gzSize: st.size, gzMtimeMs: st.mtimeMs })}\n`,
    "utf8",
  );
}

main().catch((err) => {
  console.error("[ensure-local-db]", err);
  process.exit(1);
});
