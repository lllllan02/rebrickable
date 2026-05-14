"use server";

import fs from "fs/promises";
import path from "path";
import { and, count, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildImages } from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import {
  BUILD_SUBJECT_MOC,
  isBuildSubjectKind,
  isSafeBuildSubjectId,
  type BuildSubjectKind,
} from "@/lib/build-subject";
import {
  ensureBuildUploadDir,
  isAllowedBuildImageMime,
  makeStoredImageFileName,
  buildUploadAbsoluteDir,
  BUILD_IMAGE_UPLOAD_MAX_BYTES,
  BUILD_IMAGE_UPLOAD_MAX_FILES_PER_SUBJECT,
  BUILD_UPLOAD_MAX_ID_LEN,
} from "@/lib/build-upload-storage";

function inferMimeFromName(fileName: string): string | null {
  const n = fileName.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return null;
}

function resolveImageMime(file: File): string | null {
  if (file.type && isAllowedBuildImageMime(file.type)) return file.type;
  return inferMimeFromName(file.name);
}

function parseSubjectFromForm(formData: FormData): { kind: BuildSubjectKind; id: string } | null {
  const kindRaw = String(formData.get("subjectKind") ?? "").trim();
  const id = String(formData.get("subjectId") ?? "").trim();
  if (!id || id.length > BUILD_UPLOAD_MAX_ID_LEN) return null;
  if (!isBuildSubjectKind(kindRaw)) return null;
  if (!isSafeBuildSubjectId(kindRaw, id)) return null;
  return { kind: kindRaw, id };
}

export async function uploadBuildImageAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sub = parseSubjectFromForm(formData);
  const file = formData.get("file");

  if (!sub) {
    return { ok: false, error: "主体无效。" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "请选择图片文件。" };
  }
  if (file.size > BUILD_IMAGE_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `单张图片不超过 ${Math.round(BUILD_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB。`,
    };
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
    const db = getUserDb();
    const [cntRow] = await db
      .select({ n: count() })
      .from(buildImages)
      .where(and(eq(buildImages.subjectKind, sub.kind), eq(buildImages.subjectId, sub.id)));
    const n = Number(cntRow?.n ?? 0);
    if (n >= BUILD_IMAGE_UPLOAD_MAX_FILES_PER_SUBJECT) {
      return {
        ok: false,
        error: `每个主体最多上传 ${BUILD_IMAGE_UPLOAD_MAX_FILES_PER_SUBJECT} 张图。`,
      };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dir = await ensureBuildUploadDir(sub.kind, sub.id);
    const absPath = path.join(dir, storedFile);
    await fs.writeFile(absPath, buf);

    try {
      await db.insert(buildImages).values({
        subjectKind: sub.kind,
        subjectId: sub.id,
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

    revalidateBuildSubjectPaths(sub.kind, sub.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "上传失败，请重试。" };
  }
}

export async function uploadMocImageAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  return uploadBuildImageAction(formData);
}

export async function deleteBuildImageAction(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string,
  imageId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }
  if (!Number.isFinite(imageId) || imageId <= 0) {
    return { ok: false, error: "图片 ID 无效。" };
  }

  try {
    const db = getUserDb();
    const [row] = await db
      .select({ id: buildImages.id, storedFile: buildImages.storedFile })
      .from(buildImages)
      .where(
        and(
          eq(buildImages.id, imageId),
          eq(buildImages.subjectKind, subjectKind),
          eq(buildImages.subjectId, subjectId)
        )
      )
      .limit(1);

    if (!row) {
      return { ok: false, error: "未找到该图片。" };
    }

    await db.delete(buildImages).where(eq(buildImages.id, row.id));
    const abs = path.join(buildUploadAbsoluteDir(subjectKind, subjectId), row.storedFile);
    await fs.unlink(abs).catch(() => {});

    revalidateBuildSubjectPaths(subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}

export async function deleteMocImageAction(
  mocIdRaw: string,
  imageId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteBuildImageAction(BUILD_SUBJECT_MOC, mocIdRaw, imageId);
}
