import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { mocAttachments, mocs } from "@/db/schema";

import {
  inferMocAttachmentType,
  isMocAttachmentDbType,
  type MocAttachmentDbType,
} from "@/lib/moc-attachment-kind";

import type { MocImportResult } from "@/lib/moc-import";

const maxAttachmentBytes = 50 * 1024 * 1024;
const maxAttachmentCount = 15;

function sanitizeStorageSegment(name: string) {
  const trimmed = name.trim().slice(-120) || "file";

  return trimmed.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function resolveTypeForFile(fileName: string, formKind: string): MocAttachmentDbType {
  if (formKind !== "auto" && isMocAttachmentDbType(formKind)) {
    return formKind;
  }

  return inferMocAttachmentType(fileName);
}

export async function appendMocAttachments(
  mocId: number,
  files: File[],
  formKind: string,
): Promise<MocImportResult & { saved: number }> {
  if (files.length === 0) {
    return { ok: true, message: "", saved: 0 };
  }

  if (files.length > maxAttachmentCount) {
    return {
      ok: false,
      message: `单次最多上传 ${maxAttachmentCount} 个附件。`,
      saved: 0,
    };
  }

  if (!Number.isInteger(mocId) || mocId <= 0) {
    return { ok: false, message: "MOC ID 无效。", saved: 0 };
  }

  const mocRow = db.select({ mocId: mocs.mocId }).from(mocs).where(eq(mocs.mocId, mocId)).get();

  if (!mocRow) {
    return { ok: false, message: "MOC 不存在，请先完成清单导入。", saved: 0 };
  }

  const kindKey = formKind.trim() || "auto";

  for (const file of files) {
    if (file.size > maxAttachmentBytes) {
      return {
        ok: false,
        message: `文件「${file.name}」超过 ${maxAttachmentBytes / (1024 * 1024)} MB 上限。`,
        saved: 0,
      };
    }
  }

  const publicDir = join(process.cwd(), "public", "lego-assets", "mocs", String(mocId));
  await mkdir(publicDir, { recursive: true });

  const now = new Date();
  let saved = 0;

  try {
    for (const file of files) {
      const attachmentType = resolveTypeForFile(file.name, kindKey);
      const safeTail = sanitizeStorageSegment(file.name);
      const storedName = `${randomUUID()}_${safeTail}`;
      const publicPath = `/lego-assets/mocs/${mocId}/${storedName}`;
      const diskPath = join(publicDir, storedName);

      const buffer = Buffer.from(await file.arrayBuffer());

      let insertedId: number | undefined;

      try {
        const row = db
          .insert(mocAttachments)
          .values({
            mocId,
            attachmentType,
            originalFileName: file.name || storedName,
            publicPath,
            mimeType: file.type || null,
            fileSize: buffer.byteLength,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: mocAttachments.id })
          .get();

        insertedId = row?.id;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "数据库写入失败。";

        return { ok: false, message: `附件「${file.name}」未保存：${msg}`, saved };
      }

      try {
        await writeFile(diskPath, buffer);
      } catch (error) {
        if (insertedId !== undefined) {
          db.delete(mocAttachments).where(eq(mocAttachments.id, insertedId)).run();
        }

        const msg = error instanceof Error ? error.message : "磁盘写入失败。";

        return { ok: false, message: `附件「${file.name}」写入失败：${msg}`, saved };
      }

      saved += 1;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "附件处理失败。";

    return { ok: false, message: msg, saved };
  }

  return {
    ok: true,
    message: saved > 0 ? `已保存 ${saved} 个附件。` : "",
    saved,
  };
}

/** 删除磁盘文件（忽略不存在）；用于回滚或未来「删除附件」功能。 */
export async function removeMocAttachmentFileFromDisk(publicPath: string) {
  const relative = publicPath.startsWith("/") ? publicPath.slice(1) : publicPath;
  const diskPath = join(process.cwd(), "public", relative);

  try {
    await unlink(diskPath);
  } catch {
    // 忽略
  }
}
