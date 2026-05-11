import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

/** 与 `parts-sheet/actions` 中 MOC ID 上限一致 */
export const MOC_UPLOAD_MAX_ID_LEN = 128;

export const MOC_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const MOC_UPLOAD_MAX_FILES_PER_MOC = 40;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function mocUploadDirSlug(mocId: string): string {
  return crypto.createHash("sha256").update(mocId, "utf8").digest("hex");
}

export function mocUploadRootDir(cwd = process.cwd()): string {
  return path.join(cwd, "data", "moc-uploads");
}

export function mocUploadAbsoluteDir(mocId: string, cwd = process.cwd()): string {
  return path.join(mocUploadRootDir(cwd), mocUploadDirSlug(mocId));
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
