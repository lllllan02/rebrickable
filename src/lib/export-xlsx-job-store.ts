import { randomUUID } from "node:crypto";

export type ExportJobRecord = {
  stem: string;
  total: number;
  current: number;
  writingFile: boolean;
  status: "running" | "done" | "error";
  buffer?: Buffer;
  errorMessage?: string;
  createdAt: number;
};

/**
 * 使用 globalThis 挂 Map：避免 Next dev / Turbopack 热更新时模块级 Map 被重新实例化，
 * 导致 POST /start 写入的任务与 GET /status 读到的不是同一存储（从而一直 404）。
 * 部署在无共享内存的多实例环境时，仍可能不成立，需改为外部存储。
 */
const STORE_KEY = "__rebrickable_parts_sheet_export_jobs__" as const;

function getJobStore(): Map<string, ExportJobRecord> {
  const g = globalThis as unknown as Record<
    typeof STORE_KEY,
    Map<string, ExportJobRecord> | undefined
  >;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = new Map();
  }
  return g[STORE_KEY];
}

const MAX_JOBS = 48;
const TTL_MS = 15 * 60 * 1000;

function prune(aggressive: boolean) {
  const jobs = getJobStore();
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (now - j.createdAt > TTL_MS) jobs.delete(id);
  }
  if (aggressive && jobs.size > MAX_JOBS) {
    const sorted = [...jobs.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    while (jobs.size > MAX_JOBS && sorted.length) {
      const [id] = sorted.shift()!;
      jobs.delete(id);
    }
  }
}

export function createExportJob(stem: string, total: number): string {
  const jobs = getJobStore();
  prune(false);
  const id = randomUUID();
  jobs.set(id, {
    stem,
    total,
    current: 0,
    writingFile: false,
    status: "running",
    createdAt: Date.now(),
  });
  if (jobs.size > MAX_JOBS) prune(true);
  return id;
}

export function markExportJobRow(jobId: string, doneRows: number, totalRows: number) {
  const j = getJobStore().get(jobId);
  if (!j) return;
  j.current = doneRows;
  j.total = totalRows;
  j.writingFile = false;
}

export function markExportJobWritingFile(jobId: string) {
  const j = getJobStore().get(jobId);
  if (!j) return;
  j.writingFile = true;
}

export function completeExportJob(jobId: string, buffer: Buffer) {
  const j = getJobStore().get(jobId);
  if (!j) return;
  j.status = "done";
  j.buffer = buffer;
  j.writingFile = false;
  j.current = j.total;
}

export function failExportJob(jobId: string, message: string) {
  const j = getJobStore().get(jobId);
  if (!j) return;
  j.status = "error";
  j.errorMessage = message;
  j.writingFile = false;
}

export function getExportJob(jobId: string): ExportJobRecord | undefined {
  return getJobStore().get(jobId);
}

export function consumeExportJobResult(jobId: string): { buffer: Buffer; stem: string } | null {
  const jobs = getJobStore();
  const j = jobs.get(jobId);
  if (!j || j.status !== "done" || !j.buffer) return null;
  const out = { buffer: j.buffer, stem: j.stem };
  jobs.delete(jobId);
  return out;
}
