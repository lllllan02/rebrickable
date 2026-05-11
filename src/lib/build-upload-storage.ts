import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import type { BuildSubjectKind } from "@/lib/build-subject";
import { isSafeBuildSubjectId } from "@/lib/build-subject";

export const BUILD_UPLOAD_MAX_ID_LEN = 128;

export const BUILD_IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const BUILD_IMAGE_UPLOAD_MAX_FILES_PER_SUBJECT = 40;

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function buildUploadRootDir(cwd = process.cwd()): string {
  return path.join(cwd, "data", "build-uploads");
}

export function buildUploadAbsoluteDir(
  kind: BuildSubjectKind,
  subjectId: string,
  cwd = process.cwd()
): string {
  if (!isSafeBuildSubjectId(kind, subjectId)) {
    throw new Error("Invalid build subject for upload path");
  }
  return path.join(buildUploadRootDir(cwd), kind, subjectId);
}

export function extFromImageMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return null;
  }
}

export function isAllowedBuildImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME.has(mime);
}

export function makeStoredImageFileName(mime: string): string | null {
  const ext = extFromImageMime(mime);
  if (!ext) return null;
  return `${crypto.randomUUID()}${ext}`;
}

export async function ensureBuildUploadDir(
  kind: BuildSubjectKind,
  subjectId: string,
  cwd = process.cwd()
): Promise<string> {
  const dir = buildUploadAbsoluteDir(kind, subjectId, cwd);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export const BUILD_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export const BUILD_ATTACHMENT_MAX_FILES_PER_SUBJECT = 24;

export type BuildAttachmentKind = "pdf" | "io";

export function inferBuildAttachmentKindFromName(fileName: string): BuildAttachmentKind | null {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".io")) return "io";
  return null;
}

export function resolveBuildAttachmentMime(file: File, kind: BuildAttachmentKind): string {
  const t = (file.type ?? "").trim().toLowerCase();
  if (kind === "pdf") {
    return "application/pdf";
  }
  if (t === "application/zip" || t === "application/x-zip-compressed") {
    return t;
  }
  return "application/octet-stream";
}

export function makeStoredAttachmentFileName(kind: BuildAttachmentKind): string {
  return `${crypto.randomUUID()}.${kind}`;
}
