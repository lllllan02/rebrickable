/** 与 `moc_attachments.attachment_type` 及 Drizzle schema 保持一致。 */
export const mocAttachmentTypes = [
  "instructions",
  "studio_io",
  "ldraw",
  "pdf",
  "archive",
  "image",
  "other",
] as const;

export type MocAttachmentDbType = (typeof mocAttachmentTypes)[number];

export function isMocAttachmentDbType(value: string): value is MocAttachmentDbType {
  return (mocAttachmentTypes as readonly string[]).includes(value);
}

/** 上传表单：自动 或 固定类型（对所有选中文件生效）。 */
export const mocAttachmentFormKindValues = ["auto", ...mocAttachmentTypes] as const;

export type MocAttachmentFormKind = (typeof mocAttachmentFormKindValues)[number];

export function inferMocAttachmentType(fileName: string): MocAttachmentDbType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "io") {
    return "studio_io";
  }

  if (ext === "pdf") {
    return "instructions";
  }

  if (["ldr", "mpd", "lxf", "lxfml"].includes(ext)) {
    return "ldraw";
  }

  if (["zip", "rar", "7z"].includes(ext)) {
    return "archive";
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext)) {
    return "image";
  }

  return "other";
}

export function mocAttachmentTypeLabel(kind: MocAttachmentDbType): string {
  const labels: Record<MocAttachmentDbType, string> = {
    instructions: "说明书 / PDF",
    studio_io: "Stud.io（.io）",
    ldraw: "LDraw / Studio 交换",
    pdf: "PDF 文档",
    archive: "压缩包",
    image: "图片",
    other: "其他",
  };

  return labels[kind];
}
