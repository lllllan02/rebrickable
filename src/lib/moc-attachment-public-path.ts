/** 本地用户上传的 MOC 附件（由 Route Handler 读取磁盘并返回） */
export function mocAttachmentPublicPath(mocId: string, storedFile: string): string {
  return `/api/moc-attachments/${encodeURIComponent(mocId)}/${encodeURIComponent(storedFile)}`;
}
