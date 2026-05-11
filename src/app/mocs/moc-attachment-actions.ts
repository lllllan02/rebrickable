"use server";

import fs from "fs/promises";
import path from "path";
import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { buildAttachments } from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import {
  BUILD_SUBJECT_MOC,
  isBuildSubjectKind,
  isSafeBuildSubjectId,
  type BuildSubjectKind,
} from "@/lib/build-subject";
import {
  ensureBuildUploadDir,
  inferBuildAttachmentKindFromName,
  makeStoredAttachmentFileName,
  BUILD_ATTACHMENT_MAX_BYTES,
  BUILD_ATTACHMENT_MAX_FILES_PER_SUBJECT,
  BUILD_UPLOAD_MAX_ID_LEN,
  buildUploadAbsoluteDir,
  resolveBuildAttachmentMime,
} from "@/lib/build-upload-storage";

export async function uploadBuildAttachmentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const kindRaw = String(formData.get("subjectKind") ?? "").trim();
  const subjectId = String(formData.get("subjectId") ?? "").trim();
  const file = formData.get("file");

  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isBuildSubjectKind(kindRaw)) {
    return { ok: false, error: "主体无效。" };
  }
  if (!isSafeBuildSubjectId(kindRaw, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "请选择文件。" };
  }
  if (file.size > BUILD_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: `单个附件不超过 ${Math.round(BUILD_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB。`,
    };
  }

  const attKind = inferBuildAttachmentKindFromName(file.name);
  if (!attKind) {
    return { ok: false, error: "仅支持 PDF（说明书）与 .io（Studio 等源文件）。" };
  }

  const mime = resolveBuildAttachmentMime(file, attKind);

  const storedFile = makeStoredAttachmentFileName(attKind);

  try {
    const db = getDb();
    const [cntRow] = await db
      .select({ n: count() })
      .from(buildAttachments)
      .where(and(eq(buildAttachments.subjectKind, kindRaw), eq(buildAttachments.subjectId, subjectId)));
    const n = Number(cntRow?.n ?? 0);
    if (n >= BUILD_ATTACHMENT_MAX_FILES_PER_SUBJECT) {
      return {
        ok: false,
        error: `每个主体最多上传 ${BUILD_ATTACHMENT_MAX_FILES_PER_SUBJECT} 个附件。`,
      };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dir = await ensureBuildUploadDir(kindRaw, subjectId);
    const absPath = path.join(dir, storedFile);
    await fs.writeFile(absPath, buf);

    try {
      await db.insert(buildAttachments).values({
        subjectKind: kindRaw,
        subjectId,
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

    revalidateBuildSubjectPaths(kindRaw, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "上传失败，请重试。" };
  }
}

export async function uploadMocAttachmentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  return uploadBuildAttachmentAction(formData);
}

export async function deleteBuildAttachmentAction(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string,
  attachmentId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }
  if (!Number.isFinite(attachmentId) || attachmentId <= 0) {
    return { ok: false, error: "附件 ID 无效。" };
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({ id: buildAttachments.id, storedFile: buildAttachments.storedFile })
      .from(buildAttachments)
      .where(
        and(
          eq(buildAttachments.id, attachmentId),
          eq(buildAttachments.subjectKind, subjectKind),
          eq(buildAttachments.subjectId, subjectId)
        )
      )
      .limit(1);

    if (!row) {
      return { ok: false, error: "未找到该附件。" };
    }

    await db.delete(buildAttachments).where(eq(buildAttachments.id, row.id));
    const abs = path.join(buildUploadAbsoluteDir(subjectKind, subjectId), row.storedFile);
    await fs.unlink(abs).catch(() => {});

    revalidateBuildSubjectPaths(subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}

export async function deleteMocAttachmentAction(
  mocIdRaw: string,
  attachmentId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteBuildAttachmentAction(BUILD_SUBJECT_MOC, mocIdRaw, attachmentId);
}
