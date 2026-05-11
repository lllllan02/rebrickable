"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocAttachments } from "@/db/schema";
import {
  ensureMocUploadDir,
  inferMocAttachmentKindFromName,
  isSafeMocIdForUploadPath,
  makeStoredAttachmentFileName,
  MOC_ATTACHMENT_MAX_BYTES,
  MOC_ATTACHMENT_MAX_FILES_PER_MOC,
  MOC_UPLOAD_MAX_ID_LEN,
  mocUploadAbsoluteDir,
  resolveMocAttachmentMime,
} from "@/lib/moc-upload-storage";

function revalidateMocPage(mocId: string) {
  revalidatePath(`/mocs/${mocId}`);
  revalidatePath("/mocs");
}

export async function uploadMocAttachmentAction(
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
    return { ok: false, error: "请选择文件。" };
  }
  if (file.size > MOC_ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: `单个附件不超过 ${Math.round(MOC_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB。` };
  }

  const kind = inferMocAttachmentKindFromName(file.name);
  if (!kind) {
    return { ok: false, error: "仅支持 PDF（说明书）与 .io（Studio 等源文件）。" };
  }

  const mime = resolveMocAttachmentMime(file, kind);

  const storedFile = makeStoredAttachmentFileName(kind);

  try {
    const db = getDb();
    const [cntRow] = await db
      .select({ n: count() })
      .from(mocAttachments)
      .where(eq(mocAttachments.mocId, mocId));
    const n = Number(cntRow?.n ?? 0);
    if (n >= MOC_ATTACHMENT_MAX_FILES_PER_MOC) {
      return { ok: false, error: `每个 MOC 最多上传 ${MOC_ATTACHMENT_MAX_FILES_PER_MOC} 个附件。` };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const dir = await ensureMocUploadDir(mocId);
    const absPath = path.join(dir, storedFile);
    await fs.writeFile(absPath, buf);

    try {
      await db.insert(mocAttachments).values({
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

export async function deleteMocAttachmentAction(
  mocIdRaw: string,
  attachmentId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mocId = mocIdRaw.trim();
  if (!mocId || mocId.length > MOC_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "MOC ID 无效。" };
  }
  if (!isSafeMocIdForUploadPath(mocId)) {
    return { ok: false, error: "MOC ID 含有非法字符。" };
  }
  if (!Number.isFinite(attachmentId) || attachmentId <= 0) {
    return { ok: false, error: "附件 ID 无效。" };
  }

  try {
    const db = getDb();
    const [row] = await db
      .select({ id: mocAttachments.id, storedFile: mocAttachments.storedFile })
      .from(mocAttachments)
      .where(and(eq(mocAttachments.id, attachmentId), eq(mocAttachments.mocId, mocId)))
      .limit(1);

    if (!row) {
      return { ok: false, error: "未找到该附件。" };
    }

    await db.delete(mocAttachments).where(eq(mocAttachments.id, row.id));
    const abs = path.join(mocUploadAbsoluteDir(mocId), row.storedFile);
    await fs.unlink(abs).catch(() => {});

    revalidateMocPage(mocId);
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}
