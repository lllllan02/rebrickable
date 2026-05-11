"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocImages } from "@/db/schema";
import {
  ensureMocUploadDir,
  isAllowedMocImageMime,
  isSafeMocIdForUploadPath,
  makeStoredImageFileName,
  mocUploadAbsoluteDir,
  MOC_UPLOAD_MAX_BYTES,
  MOC_UPLOAD_MAX_FILES_PER_MOC,
  MOC_UPLOAD_MAX_ID_LEN,
} from "@/lib/moc-upload-storage";

function revalidateMocPage(mocId: string) {
  revalidatePath(`/mocs/${mocId}`);
  revalidatePath("/mocs");
}

function inferMimeFromName(fileName: string): string | null {
  const n = fileName.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return null;
}

function resolveImageMime(file: File): string | null {
  if (file.type && isAllowedMocImageMime(file.type)) return file.type;
  return inferMimeFromName(file.name);
}

export async function uploadMocImageAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mocId = String(formData.get("mocId") ?? "").trim();
  const file = formData.get("file");

  if (!mocId || mocId.length > MOC_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  if (!isSafeMocIdForUploadPath(mocId)) {
    return { ok: false, error: "MOC ID 含有非法字符。" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "请选择图片文件。" };
  }
  if (file.size > MOC_UPLOAD_MAX_BYTES) {
    return { ok: false, error: `单张图片不超过 ${Math.round(MOC_UPLOAD_MAX_BYTES / (1024 * 1024))} MB。` };
  }

  const mime = resolveImageMime(file);
  if (!mime) {
    return { ok: false, error: "仅支持 JPEG、PNG、WebP、GIF。" };
  }

  const storedFile = makeStoredImageFileName(mime);
  if (!storedFile) {
    return { ok: false, error: "无法生成存储文件名。" };
  }

  try {
    const db = getDb();
    const [cntRow] = await db
      .select({ n: count() })
      .from(mocImages)
      .where(eq(mocImages.mocId, mocId));
    const n = Number(cntRow?.n ?? 0);
    if (n >= MOC_UPLOAD_MAX_FILES_PER_MOC) {
      return { ok: false, error: `每个 MOC 最多上传 ${MOC_UPLOAD_MAX_FILES_PER_MOC} 张图。` };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dir = await ensureMocUploadDir(mocId);
    const absPath = path.join(dir, storedFile);
    await fs.writeFile(absPath, buf);

    try {
      await db.insert(mocImages).values({
        mocId,
        storedFile,
        originalName: file.name.trim() || null,
        mimeType: mime,
        byteSize: buf.length,
        createdAt: new Date().toISOString(),
      });
    } catch {
      await fs.unlink(absPath).catch(() => {});
      return { ok: false, error: "写入记录失败。" };
    }

    revalidateMocPage(mocId);
    return { ok: true };
  } catch {
    return { ok: false, error: "上传失败，请重试。" };
  }
}

export async function deleteMocImageAction(
  mocIdRaw: string,
  imageId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mocId = mocIdRaw.trim();
  if (!mocId || mocId.length > MOC_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  if (!isSafeMocIdForUploadPath(mocId)) {
    return { ok: false, error: "MOC ID 含有非法字符。" };
  }
  if (!Number.isFinite(imageId) || imageId <= 0) {
    return { ok: false, error: "图片 ID 无效。" };
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({ id: mocImages.id, storedFile: mocImages.storedFile })
      .from(mocImages)
      .where(and(eq(mocImages.id, imageId), eq(mocImages.mocId, mocId)))
      .limit(1);

    if (!row) {
      return { ok: false, error: "未找到该图片。" };
    }

    await db.delete(mocImages).where(eq(mocImages.id, row.id));
    const abs = path.join(mocUploadAbsoluteDir(mocId), row.storedFile);
    await fs.unlink(abs).catch(() => {});

    revalidateMocPage(mocId);
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}
