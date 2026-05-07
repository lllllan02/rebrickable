/** 与 `/api/download-jobs` JSON 及下载记录 UI 对齐的任务行结构。 */
export type DownloadJobItem = {
  id: number;
  sourceType: "set" | "moc" | "catalog";
  sourceId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  message: string | null;
  progressStage: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressDetail: string | null;
  updatedAt: string;
};
