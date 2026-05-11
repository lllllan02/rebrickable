export const BUILD_SUBJECT_MOC = "moc" as const;
export const BUILD_SUBJECT_SET = "set" as const;

export type BuildSubjectKind = typeof BUILD_SUBJECT_MOC | typeof BUILD_SUBJECT_SET;

export function isBuildSubjectKind(v: string): v is BuildSubjectKind {
  return v === BUILD_SUBJECT_MOC || v === BUILD_SUBJECT_SET;
}

/** 作为目录名片段：禁止路径分隔与 `..` */
export function isSafeBuildSubjectId(kind: BuildSubjectKind, id: string): boolean {
  if (!id || id.length > 128) return false;
  if (id === "." || id === "..") return false;
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return false;
  void kind;
  return true;
}
