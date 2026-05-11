/**
 * 将 MOC 图片从旧目录 data/moc-uploads/<sha256(moc_id)>/ 迁到 data/moc-uploads/<moc_id>/。
 * 依据 moc_images 表中的 moc_id、stored_file 移动文件；不改动数据库。
 * 用法：pnpm db:migrate-moc-uploads
 */
import crypto from "crypto";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import Database from "better-sqlite3";

import { ensureMocImagesTable } from "../src/db/ensure-moc-images-table";
import { isSafeMocIdForUploadPath, mocUploadRootDir } from "../src/lib/moc-upload-storage";

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "rebrickable.db");

function legacyMocUploadDirSlug(mocId: string): string {
  return crypto.createHash("sha256").update(mocId, "utf8").digest("hex");
}

const HEX64 = /^[0-9a-f]{64}$/i;

async function main() {
  const uploadRoot = mocUploadRootDir(ROOT);

  if (!existsSync(DB_PATH)) {
    console.log(`跳过：未找到数据库 ${DB_PATH}`);
    return;
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  ensureMocImagesTable(sqlite);

  type Row = { moc_id: string; stored_file: string };
  const rows = sqlite
    .prepare(`SELECT moc_id, stored_file FROM moc_images`)
    .all() as Row[];

  let moved = 0;
  let skippedAlready = 0;
  let skippedUnsafe = 0;
  let missingOld = 0;
  let cleanedOldDup = 0;

  for (const { moc_id: mocId, stored_file: storedFile } of rows) {
    if (!isSafeMocIdForUploadPath(mocId)) {
      console.warn(`[skip unsafe moc_id] ${JSON.stringify(mocId)}`);
      skippedUnsafe++;
      continue;
    }

    const legacyDir = path.join(uploadRoot, legacyMocUploadDirSlug(mocId));
    const targetDir = path.join(uploadRoot, mocId);
    const from = path.join(legacyDir, storedFile);
    const to = path.join(targetDir, storedFile);

    try {
      await fs.access(to);
      skippedAlready++;
      try {
        await fs.access(from);
        await fs.unlink(from);
        cleanedOldDup++;
      } catch {
        /* old 已不存在 */
      }
      continue;
    } catch {
      /* to 不存在，继续迁 */
    }

    try {
      await fs.access(from);
    } catch {
      missingOld++;
      console.warn(`[missing file] moc_id=${mocId} stored_file=${storedFile}`);
      continue;
    }

    await fs.mkdir(targetDir, { recursive: true });
    await fs.rename(from, to);
    moved++;
  }

  // 删除已空的旧哈希目录
  let removedEmptyLegacy = 0;
  try {
    const names = await fs.readdir(uploadRoot);
    for (const name of names) {
      if (!HEX64.test(name)) continue;
      const dir = path.join(uploadRoot, name);
      const stat = await fs.stat(dir).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const rest = await fs.readdir(dir);
      if (rest.length === 0) {
        await fs.rmdir(dir);
        removedEmptyLegacy++;
      } else {
        console.warn(`[legacy dir not empty] ${dir} → ${rest.join(", ")}`);
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }

  console.log(
    JSON.stringify(
      {
        rows: rows.length,
        moved,
        skippedAlreadyNewExists: skippedAlready,
        cleanedDuplicateOldFile: cleanedOldDup,
        skippedUnsafeMocId: skippedUnsafe,
        missingOldFile: missingOld,
        removedEmptyLegacyDirs: removedEmptyLegacy,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
