/**
 * 若仓库存在 data/rebrickable-user.db.gz，则解压为 data/rebrickable-user.db。
 * 由 postinstall 在 ensure-local-db 之后调用；无 .gz 时跳过（由应用在首次打开用户库时创建空库）。
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { createReadStream, createWriteStream } from "fs";
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";

import { USER_DB_FILE, USER_DB_GZ } from "../src/db/db-paths";

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", USER_DB_FILE);
const GZ_PATH = path.join(ROOT, "data", USER_DB_GZ);
const GZ_REF_PATH = path.join(ROOT, "data", ".rebrickable-user-db-from-gz.json");

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
    /* */
  }
  return null;
}

async function main() {
  if (process.env.SKIP_LOCAL_DB_UNPACK === "1") return;
  if (!fs.existsSync(GZ_PATH)) return;

  let gzStat: fs.Stats;
  try {
    gzStat = await fs.promises.stat(GZ_PATH);
  } catch (e) {
    console.error("[ensure-user-local-db] 无法 stat user .gz", e);
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
    console.error("[ensure-user-local-db] 无法读取 user .gz 以计算校验和", e);
    process.exit(1);
  }

  if (dbOk && prevRef && prevRef.sha256 === gzHash) {
    await fs.promises.writeFile(
      GZ_REF_PATH,
      `${JSON.stringify({ v: 1 as const, sha256: gzHash, gzSize: gzStat.size, gzMtimeMs: gzStat.mtimeMs })}\n`,
      "utf8"
    );
    return;
  }

  await fs.promises.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  await pipeline(createReadStream(GZ_PATH), createGunzip(), createWriteStream(tmp));
  for (const side of [`${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
    try {
      await fs.promises.unlink(side);
    } catch {
      /* */
    }
  }
  await fs.promises.rename(tmp, DB_PATH);
  const st = await fs.promises.stat(GZ_PATH);
  await fs.promises.writeFile(
    GZ_REF_PATH,
    `${JSON.stringify({ v: 1 as const, sha256: gzHash, gzSize: st.size, gzMtimeMs: st.mtimeMs })}\n`,
    "utf8"
  );
}

main().catch((err) => {
  console.error("[ensure-user-local-db]", err);
  process.exit(1);
});
