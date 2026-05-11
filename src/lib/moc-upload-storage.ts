import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

/** 与 `moc-parts-sheet-actions` 中 MOC ID 上限一致 */
export const MOC_UPLOAD_MAX_ID_LEN = 128;

export const MOC_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const MOC_UPLOAD_MAX_FILES_PER_MOC = 40;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** 作为单级目录名使用，禁止路径分隔与 `..` 以免逃出 `data/moc-uploads/` */
export function isSafeMocIdForUploadPath(mocId: string): boolean {
  if (!mocId || mocId.length > MOC_UPLOAD_MAX_ID_LEN) return false;
  if (mocId === "." || mocId === "..") return false;
  if (mocId.includes("/") || mocId.includes("\\") || mocId.includes("..")) return false;
  return true;
}

export function mocUploadRootDir(cwd = process.cwd()): string {
  return path.join(cwd, "data", "moc-uploads");
}

export function mocUploadAbsoluteDir(mocId: string, cwd = process.cwd()): string {
  if (!isSafeMocIdForUploadPath(mocId)) {
    throw new Error("Invalid MOC ID for upload path");
  }
  return path.join(mocUploadRootDir(cwd), mocId);
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

export function isAllowedMocImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export function makeStoredImageFileName(mime: string): string | null {
  const ext = extFromImageMime(mime);
  if (!ext) return null;
  return `${crypto.randomUUID()}${ext}`;
}

export async function ensureMocUploadDir(mocId: string, cwd = process.cwd()): Promise<string> {
  const dir = mocUploadAbsoluteDir(mocId, cwd);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** 说明书 PDF、Studio .io 等 */
export const MOC_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export const MOC_ATTACHMENT_MAX_FILES_PER_MOC = 24;

export type MocAttachmentKind = "pdf" | "io";

export function inferMocAttachmentKindFromName(fileName: string): MocAttachmentKind | null {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".io")) return "io";
  return null;
}

/** 浏览器对 .io 的 type 常为空或 octet-stream；以扩展名为准，此处仅决定存库与 Content-Type。 */
export function resolveMocAttachmentMime(file: File, kind: MocAttachmentKind): string {
  const t = (file.type ?? "").trim().toLowerCase();
  if (kind === "pdf") {
    return "application/pdf";
  }
  if (t === "application/zip" || t === "application/x-zip-compressed") {
    return t;
  }
  return "application/octet-stream";
}

export function makeStoredAttachmentFileName(kind: MocAttachmentKind): string {
  return `${crypto.randomUUID()}.${kind}`;
}
