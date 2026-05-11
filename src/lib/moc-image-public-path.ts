/** 本地用户上传的 MOC 图（由 Route Handler 读取磁盘并返回） */
export function mocImagePublicPath(mocId: string, storedFile: string): string {
  return `/api/moc-images/${encodeURIComponent(mocId)}/${encodeURIComponent(storedFile)}`;
}
