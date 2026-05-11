"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { buildAttachments } from "@/db/schema";
import { BUILD_SUBJECT_MOC, isBuildSubjectKind, isSafeBuildSubjectId } from "@/lib/build-subject";
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

function revalidateMocPage(mocId: string) {
  revalidatePath(`/mocs/${mocId}`);
  revalidatePath("/mocs");
}

export async function uploadMocAttachmentAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const kindRaw = String(formData.get("subjectKind") ?? "").trim();
  const mocId = String(formData.get("subjectId") ?? "").trim();
  const file = formData.get("file");

  if (!mocId || mocId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  if (!isBuildSubjectKind(kindRaw) || kindRaw !== BUILD_SUBJECT_MOC) {
    return { ok: false, error: "主体无效。" };
  }
  if (!isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return { ok: false, error: "MOC ID 含有非法字符。" };
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
      .where(and(eq(buildAttachments.subjectKind, BUILD_SUBJECT_MOC), eq(buildAttachments.subjectId, mocId)));
    const n = Number(cntRow?.n ?? 0);
    if (n >= BUILD_ATTACHMENT_MAX_FILES_PER_SUBJECT) {
      return {
        ok: false,
        error: `每个 MOC 最多上传 ${BUILD_ATTACHMENT_MAX_FILES_PER_SUBJECT} 个附件。`,
      };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dir = await ensureBuildUploadDir(BUILD_SUBJECT_MOC, mocId);
    const absPath = path.join(dir, storedFile);
    await fs.writeFile(absPath, buf);

    try {
      await db.insert(buildAttachments).values({
        subjectKind: BUILD_SUBJECT_MOC,
        subjectId: mocId,
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

export async function deleteMocAttachmentAction(
  mocIdRaw: string,
  attachmentId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mocId = mocIdRaw.trim();
  if (!mocId || mocId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  if (!isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return { ok: false, error: "MOC ID 含有非法字符。" };
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
          eq(buildAttachments.subjectKind, BUILD_SUBJECT_MOC),
          eq(buildAttachments.subjectId, mocId)
        )
      )
      .limit(1);

    if (!row) {
      return { ok: false, error: "未找到该附件。" };
    }

    await db.delete(buildAttachments).where(eq(buildAttachments.id, row.id));
    const abs = path.join(buildUploadAbsoluteDir(BUILD_SUBJECT_MOC, mocId), row.storedFile);
    await fs.unlink(abs).catch(() => {});

    revalidateMocPage(mocId);
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}
