import { isBuildSubjectKind, isSafeBuildSubjectId, type BuildSubjectKind } from "@/lib/build-subject";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

/** 可标记「拥有」的主体：套装 / MOC / 零件（零件无 build 上传目录，仅存 SQLite 标记） */
export const OWNED_SUBJECT_PART = "part" as const;

export type OwnedSubjectKind = BuildSubjectKind | typeof OWNED_SUBJECT_PART;

export function isOwnedSubjectKind(v: string): v is OwnedSubjectKind {
  return v === OWNED_SUBJECT_PART || isBuildSubjectKind(v);
}

export function isSafeOwnedSubjectId(kind: OwnedSubjectKind, id: string): boolean {
  if (kind === OWNED_SUBJECT_PART) {
    const trimmed = id.trim();
    if (!trimmed || trimmed.length > BUILD_UPLOAD_MAX_ID_LEN) return false;
    if (trimmed === "." || trimmed === "..") return false;
    if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return false;
    return /^[a-zA-Z0-9._-]+$/.test(trimmed);
  }
  return isSafeBuildSubjectId(kind, id);
}
