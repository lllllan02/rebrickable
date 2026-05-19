import { BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { MOC_PROFILE_MAX_DISPLAY_NAME } from "@/lib/moc-profile-parse";

/** 与 {@link parseExportFilenameStem} 上限协调，避免服务端截断过多 */
export const MAX_PARTS_SHEET_EXPORT_STEM_LEN = 200;

export type PartsSheetExportBranch = "full" | "shortage" | "fulfillment";

const BRANCH_LABEL: Record<PartsSheetExportBranch, string> = {
  full: "完整零件表",
  shortage: "缺件表",
  fulfillment: "配货表",
};

/** 去掉路径/通配等不安全字符，并限制长度 */
export function sanitizePartsSheetExportSegment(raw: string, maxLen: number): string {
  let s = raw
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/[\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^\.+|\.+$/g, "").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

/**
 * 导出文件名的主体（不含扩展名）。
 * 规格：`{id}-{name}-{内容}`；乐高官方套装（subjectKind=set）前加 `LEGO-`。
 */
/** 配货表「修改部分」导出文件名中的内容段 */
export const FULFILLMENT_MODIFIED_EXPORT_CONTENT_LABEL = "修改部分";

export function buildPartsSheetExportStem(input: {
  kind: BuildSubjectKind;
  subjectId: string;
  displayName: string;
  branch: PartsSheetExportBranch;
  /** 覆盖默认分支名（如 {@link FULFILLMENT_MODIFIED_EXPORT_CONTENT_LABEL}） */
  contentLabel?: string;
}): string {
  const idRaw = input.subjectId.trim();
  const id = sanitizePartsSheetExportSegment(idRaw, 128) || "unknown";
  const nameRaw = input.displayName.trim() || "未命名";
  const name =
    sanitizePartsSheetExportSegment(nameRaw, MOC_PROFILE_MAX_DISPLAY_NAME) || "未命名";
  const content =
    input.contentLabel?.trim() || BRANCH_LABEL[input.branch];
  const body = `${id}-${name}-${content}`;
  const prefix = input.kind === BUILD_SUBJECT_SET ? "LEGO-" : "";
  let stem = `${prefix}${body}`;
  stem = sanitizePartsSheetExportSegment(stem, MAX_PARTS_SHEET_EXPORT_STEM_LEN);
  if (!stem) stem = `${prefix}${id}-未命名-${content}`;
  return stem;
}

/** Studio 分包导出基础名：`{MOC ID}-{名称}-{分包方案名}-{分包名}` */
export function buildIoSplitBatchExportStem(input: {
  mocId: string;
  displayName: string;
  planLabel: string;
  batchLabel: string;
  /** 同包多表时追加，如「缺件表」「修改部分」 */
  sheetSuffix?: string;
}): string {
  const id = sanitizePartsSheetExportSegment(input.mocId.trim(), 128) || "unknown";
  const name = sanitizePartsSheetExportSegment(input.displayName.trim() || "未命名", 64) || "未命名";
  const plan = sanitizePartsSheetExportSegment(input.planLabel.trim() || "分包方案", 48) || "分包方案";
  const batch = sanitizePartsSheetExportSegment(input.batchLabel.trim() || "分包", 32) || "分包";
  const suffix = input.sheetSuffix?.trim();
  const body = suffix ? `${id}-${name}-${plan}-${batch}-${suffix}` : `${id}-${name}-${plan}-${batch}`;
  return sanitizePartsSheetExportSegment(body, MAX_PARTS_SHEET_EXPORT_STEM_LEN) || `${id}-分包-未命名`;
}

/** 方案内汇总缺件表导出文件名 */
export function buildIoPlanMergedShortageExportStem(input: {
  mocId: string;
  displayName: string;
  planLabel: string;
}): string {
  return buildIoSplitBatchExportStem({
    mocId: input.mocId,
    displayName: input.displayName,
    planLabel: input.planLabel,
    batchLabel: "汇总缺件",
  });
}

/** 方案一键导出压缩包文件名 */
export function buildIoSplitPlanZipExportStem(input: {
  mocId: string;
  displayName: string;
  planLabel: string;
}): string {
  return buildIoSplitBatchExportStem({
    mocId: input.mocId,
    displayName: input.displayName,
    planLabel: input.planLabel,
    batchLabel: "全部零件表",
  });
}
