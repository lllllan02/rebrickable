"use server";

import fs from "fs/promises";
import path from "path";
import { and, count, desc, eq } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildReplicatePhases } from "@/db/schema";
import { revalidateBuildSubjectPaths } from "@/lib/build-revalidate-paths";
import {
  BUILD_SUBJECT_MOC,
  isBuildSubjectKind,
  isSafeBuildSubjectId,
  type BuildSubjectKind,
} from "@/lib/build-subject";
import { replicatePhaseDefaultLabel } from "@/lib/replicate-phase-default-label";
import {
  ensureBuildUploadDir,
  isAllowedBuildImageMime,
  makeStoredAttachmentFileName,
  makeStoredImageFileName,
  buildUploadAbsoluteDir,
  BUILD_ATTACHMENT_MAX_BYTES,
  BUILD_IMAGE_UPLOAD_MAX_BYTES,
  BUILD_REPLICATE_PHASE_LABEL_MAX_LEN,
  BUILD_REPLICATE_PHASE_MAX_PER_SUBJECT,
  BUILD_REPLICATE_PHASE_NOTE_MAX_LEN,
  BUILD_UPLOAD_MAX_ID_LEN,
  resolveBuildAttachmentMime,
} from "@/lib/build-upload-storage";

export type ReplicatePhaseRow = {
  id: number;
  label: string;
  note: string | null;
  sortOrder: number;
  renderUrl: string;
  ioUrl: string;
  renderOriginalName: string | null;
  ioOriginalName: string | null;
  ioByteSize: number;
  createdAt: string;
  updatedAt: string;
};

function inferImageMimeFromName(fileName: string): string | null {
  const n = fileName.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  return null;
}

function resolvePhaseImageMime(file: File): string | null {
  if (file.type && isAllowedBuildImageMime(file.type)) return file.type;
  return inferImageMimeFromName(file.name);
}

function parseSubjectFromForm(formData: FormData): { kind: BuildSubjectKind; id: string } | null {
  const kindRaw = String(formData.get("subjectKind") ?? "").trim();
  const id = String(formData.get("subjectId") ?? "").trim();
  if (!id || id.length > BUILD_UPLOAD_MAX_ID_LEN) return null;
  if (!isBuildSubjectKind(kindRaw)) return null;
  if (!isSafeBuildSubjectId(kindRaw, id)) return null;
  return { kind: kindRaw, id };
}

function normalizePhaseLabel(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, BUILD_REPLICATE_PHASE_LABEL_MAX_LEN);
}

function normalizePhaseNote(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, BUILD_REPLICATE_PHASE_NOTE_MAX_LEN);
}

async function unlinkPhaseFiles(
  kind: BuildSubjectKind,
  subjectId: string,
  renderStoredFile: string,
  ioStoredFile: string
): Promise<void> {
  const dir = buildUploadAbsoluteDir(kind, subjectId);
  await Promise.all([
    fs.unlink(path.join(dir, renderStoredFile)).catch(() => {}),
    fs.unlink(path.join(dir, ioStoredFile)).catch(() => {}),
  ]);
}

export async function saveReplicatePhaseAction(
  formData: FormData
): Promise<{ ok: true; phaseId: number } | { ok: false; error: string }> {
  const sub = parseSubjectFromForm(formData);
  if (!sub) {
    return { ok: false, error: "主体无效。" };
  }
  if (sub.kind !== BUILD_SUBJECT_MOC) {
    return { ok: false, error: "复刻阶段仅支持 MOC。" };
  }

  const renderFile = formData.get("renderFile");
  const ioFile = formData.get("ioFile");
  if (!(renderFile instanceof File) || renderFile.size === 0) {
    return { ok: false, error: "请选择渲染图。" };
  }
  if (!(ioFile instanceof File) || ioFile.size === 0) {
    return { ok: false, error: "请选择 Studio .io 文件。" };
  }
  if (renderFile.size > BUILD_IMAGE_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `渲染图不超过 ${Math.round(BUILD_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB。`,
    };
  }
  if (ioFile.size > BUILD_ATTACHMENT_MAX_BYTES) {
    return {
      ok: false,
      error: `.io 文件不超过 ${Math.round(BUILD_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB。`,
    };
  }

  const renderMime = resolvePhaseImageMime(renderFile);
  if (!renderMime) {
    return { ok: false, error: "渲染图仅支持 JPEG、PNG、WebP、GIF。" };
  }
  if (!ioFile.name.toLowerCase().endsWith(".io")) {
    return { ok: false, error: "请上传 .io 文件。" };
  }

  const renderStoredFile = makeStoredImageFileName(renderMime);
  if (!renderStoredFile) {
    return { ok: false, error: "无法生成渲染图存储名。" };
  }
  const ioStoredFile = makeStoredAttachmentFileName("io");
  const ioMime = resolveBuildAttachmentMime(ioFile, "io");

  try {
    const db = getUserDb();
    const subjectKey = and(
      eq(buildReplicatePhases.subjectKind, sub.kind),
      eq(buildReplicatePhases.subjectId, sub.id)
    );
    const [cntRow] = await db.select({ n: count() }).from(buildReplicatePhases).where(subjectKey);
    const existingCount = Number(cntRow?.n ?? 0);
    if (existingCount >= BUILD_REPLICATE_PHASE_MAX_PER_SUBJECT) {
      return {
        ok: false,
        error: `每个 MOC 最多保存 ${BUILD_REPLICATE_PHASE_MAX_PER_SUBJECT} 个复刻阶段。`,
      };
    }

    const defaultLabel = replicatePhaseDefaultLabel(existingCount);
    const label = normalizePhaseLabel(String(formData.get("label") ?? ""), defaultLabel);
    const note = normalizePhaseNote(String(formData.get("note") ?? ""));
    const sortOrder = existingCount + 1;
    const now = new Date().toISOString();

    const renderBuf = Buffer.from(await renderFile.arrayBuffer());
    const ioBuf = Buffer.from(await ioFile.arrayBuffer());
    const dir = await ensureBuildUploadDir(sub.kind, sub.id);
    const renderAbs = path.join(dir, renderStoredFile);
    const ioAbs = path.join(dir, ioStoredFile);
    await fs.writeFile(renderAbs, renderBuf);
    await fs.writeFile(ioAbs, ioBuf);

    try {
      const inserted = await db
        .insert(buildReplicatePhases)
        .values({
          subjectKind: sub.kind,
          subjectId: sub.id,
          label,
          note,
          sortOrder,
          renderStoredFile,
          renderMimeType: renderMime,
          renderByteSize: renderBuf.length,
          renderOriginalName: renderFile.name.trim() || null,
          ioStoredFile,
          ioMimeType: ioMime,
          ioByteSize: ioBuf.length,
          ioOriginalName: ioFile.name.trim() || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: buildReplicatePhases.id });

      const phaseId = inserted[0]?.id;
      if (!phaseId) {
        await unlinkPhaseFiles(sub.kind, sub.id, renderStoredFile, ioStoredFile);
        return { ok: false, error: "写入记录失败。" };
      }

      revalidateBuildSubjectPaths(sub.kind, sub.id);
      return { ok: true, phaseId };
    } catch {
      await unlinkPhaseFiles(sub.kind, sub.id, renderStoredFile, ioStoredFile);
      return { ok: false, error: "写入记录失败。" };
    }
  } catch {
    return { ok: false, error: "保存失败，请重试。" };
  }
}

export async function updateReplicatePhaseAction(
  formData: FormData
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sub = parseSubjectFromForm(formData);
  if (!sub) {
    return { ok: false, error: "主体无效。" };
  }
  if (sub.kind !== BUILD_SUBJECT_MOC) {
    return { ok: false, error: "复刻阶段仅支持 MOC。" };
  }

  const phaseId = Number(formData.get("phaseId"));
  if (!Number.isFinite(phaseId) || phaseId <= 0) {
    return { ok: false, error: "阶段 ID 无效。" };
  }

  const defaultLabel = replicatePhaseDefaultLabel(0);
  const label = normalizePhaseLabel(String(formData.get("label") ?? ""), defaultLabel);
  const note = normalizePhaseNote(String(formData.get("note") ?? ""));

  const renderFile = formData.get("renderFile");
  const ioFile = formData.get("ioFile");
  const hasRenderFile = renderFile instanceof File && renderFile.size > 0;
  const hasIoFile = ioFile instanceof File && ioFile.size > 0;

  let renderMime: string | null = null;
  let renderStoredFile: string | null = null;
  let renderBuf: Buffer | null = null;
  let renderOriginalName: string | null = null;

  if (hasRenderFile) {
    if (renderFile.size > BUILD_IMAGE_UPLOAD_MAX_BYTES) {
      return {
        ok: false,
        error: `渲染图不超过 ${Math.round(BUILD_IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))} MB。`,
      };
    }
    renderMime = resolvePhaseImageMime(renderFile);
    if (!renderMime) {
      return { ok: false, error: "渲染图仅支持 JPEG、PNG、WebP、GIF。" };
    }
    renderStoredFile = makeStoredImageFileName(renderMime);
    if (!renderStoredFile) {
      return { ok: false, error: "无法生成渲染图存储名。" };
    }
    renderBuf = Buffer.from(await renderFile.arrayBuffer());
    renderOriginalName = renderFile.name.trim() || null;
  }

  let ioStoredFile: string | null = null;
  let ioMime: string | null = null;
  let ioBuf: Buffer | null = null;
  let ioOriginalName: string | null = null;

  if (hasIoFile) {
    if (ioFile.size > BUILD_ATTACHMENT_MAX_BYTES) {
      return {
        ok: false,
        error: `.io 文件不超过 ${Math.round(BUILD_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB。`,
      };
    }
    if (!ioFile.name.toLowerCase().endsWith(".io")) {
      return { ok: false, error: "请上传 .io 文件。" };
    }
    ioStoredFile = makeStoredAttachmentFileName("io");
    ioMime = resolveBuildAttachmentMime(ioFile, "io");
    ioBuf = Buffer.from(await ioFile.arrayBuffer());
    ioOriginalName = ioFile.name.trim() || null;
  }

  try {
    const db = getUserDb();
    const [row] = await db
      .select({
        id: buildReplicatePhases.id,
        renderStoredFile: buildReplicatePhases.renderStoredFile,
        ioStoredFile: buildReplicatePhases.ioStoredFile,
      })
      .from(buildReplicatePhases)
      .where(
        and(
          eq(buildReplicatePhases.id, phaseId),
          eq(buildReplicatePhases.subjectKind, sub.kind),
          eq(buildReplicatePhases.subjectId, sub.id)
        )
      )
      .limit(1);

    if (!row) {
      return { ok: false, error: "未找到该阶段。" };
    }

    const dir = await ensureBuildUploadDir(sub.kind, sub.id);
    const writtenFiles: string[] = [];

    try {
      if (hasRenderFile && renderStoredFile && renderBuf && renderMime) {
        await fs.writeFile(path.join(dir, renderStoredFile), renderBuf);
        writtenFiles.push(renderStoredFile);
      }
      if (hasIoFile && ioStoredFile && ioBuf && ioMime) {
        await fs.writeFile(path.join(dir, ioStoredFile), ioBuf);
        writtenFiles.push(ioStoredFile);
      }

      const now = new Date().toISOString();
      await db
        .update(buildReplicatePhases)
        .set({
          label,
          note,
          ...(hasRenderFile && renderStoredFile && renderMime && renderBuf
            ? {
                renderStoredFile,
                renderMimeType: renderMime,
                renderByteSize: renderBuf.length,
                renderOriginalName,
              }
            : {}),
          ...(hasIoFile && ioStoredFile && ioMime && ioBuf
            ? {
                ioStoredFile,
                ioMimeType: ioMime,
                ioByteSize: ioBuf.length,
                ioOriginalName,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(buildReplicatePhases.id, row.id));

      if (hasRenderFile) {
        await fs.unlink(path.join(dir, row.renderStoredFile)).catch(() => {});
      }
      if (hasIoFile) {
        await fs.unlink(path.join(dir, row.ioStoredFile)).catch(() => {});
      }
    } catch {
      await Promise.all(writtenFiles.map((f) => fs.unlink(path.join(dir, f)).catch(() => {})));
      return { ok: false, error: "更新失败，请重试。" };
    }

    revalidateBuildSubjectPaths(sub.kind, sub.id);
    return { ok: true };
  } catch {
    return { ok: false, error: "更新失败，请重试。" };
  }
}

export async function deleteReplicatePhaseAction(
  subjectKind: BuildSubjectKind,
  subjectIdRaw: string,
  phaseId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subjectId = subjectIdRaw.trim();
  if (!subjectId || subjectId.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "主体 ID 无效。" };
  }
  if (subjectKind !== BUILD_SUBJECT_MOC) {
    return { ok: false, error: "复刻阶段仅支持 MOC。" };
  }
  if (!isSafeBuildSubjectId(subjectKind, subjectId)) {
    return { ok: false, error: "主体 ID 含有非法字符。" };
  }
  if (!Number.isFinite(phaseId) || phaseId <= 0) {
    return { ok: false, error: "阶段 ID 无效。" };
  }

  try {
    const db = getUserDb();
    const [row] = await db
      .select({
        id: buildReplicatePhases.id,
        renderStoredFile: buildReplicatePhases.renderStoredFile,
        ioStoredFile: buildReplicatePhases.ioStoredFile,
      })
      .from(buildReplicatePhases)
      .where(
        and(
          eq(buildReplicatePhases.id, phaseId),
          eq(buildReplicatePhases.subjectKind, subjectKind),
          eq(buildReplicatePhases.subjectId, subjectId)
        )
      )
      .limit(1);

    if (!row) {
      return { ok: false, error: "未找到该阶段。" };
    }

    await db.delete(buildReplicatePhases).where(eq(buildReplicatePhases.id, row.id));
    await unlinkPhaseFiles(subjectKind, subjectId, row.renderStoredFile, row.ioStoredFile);

    revalidateBuildSubjectPaths(subjectKind, subjectId);
    return { ok: true };
  } catch {
    return { ok: false, error: "删除失败，请重试。" };
  }
}
