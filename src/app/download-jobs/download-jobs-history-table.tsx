"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { DownloadJobItem } from "./download-job-item";

export type DownloadHistoryRow = DownloadJobItem & {
  createdAt: string;
};

type ApiJob = {
  id: number;
  sourceType: DownloadJobItem["sourceType"];
  sourceId: string;
  status: DownloadJobItem["status"];
  message: string | null;
  progressStage: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressDetail: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowFromApi(job: ApiJob): DownloadHistoryRow {
  return {
    id: job.id,
    sourceType: job.sourceType,
    sourceId: job.sourceId,
    status: job.status,
    message: job.message,
    progressStage: job.progressStage,
    progressCurrent: job.progressCurrent,
    progressTotal: job.progressTotal,
    progressDetail: job.progressDetail,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function hasActiveJob(rows: DownloadHistoryRow[]) {
  return rows.some((job) => job.status === "pending" || job.status === "running");
}

function progressPercent(job: DownloadHistoryRow) {
  if (!job.progressTotal || job.progressTotal <= 0 || job.progressCurrent === null) {
    return null;
  }

  return Math.min(100, Math.round((job.progressCurrent / job.progressTotal) * 100));
}

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type DownloadJobsHistoryTableProps = {
  initialRows: DownloadHistoryRow[];
  page: number;
  pageSize: number;
};

export function DownloadJobsHistoryTable({
  initialRows,
  page,
  pageSize,
}: DownloadJobsHistoryTableProps) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [cancellingJobId, setCancellingJobId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState("");
  const hadActiveJob = useRef(hasActiveJob(initialRows));
  const active = hasActiveJob(rows);

  const loadRows = useCallback(async () => {
    const response = await fetch(
      `/api/download-jobs?page=${page}&pageSize=${pageSize}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { jobs: ApiJob[] };
    setRows(data.jobs.map(rowFromApi));
  }, [page, pageSize]);

  useEffect(() => {
    if (!active && hadActiveJob.current) {
      router.refresh();
    }

    hadActiveJob.current = active;
  }, [active, router]);

  useEffect(() => {
    window.addEventListener("download-jobs:refresh", loadRows);

    return () => {
      window.removeEventListener("download-jobs:refresh", loadRows);
    };
  }, [loadRows]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(loadRows, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [active, loadRows]);

  const cancelJob = async (jobId: number) => {
    setCancellingJobId(jobId);
    setCancelError("");

    try {
      const response = await fetch("/api/download-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setCancelError(data.message ?? "取消下载失败。");
      }

      await loadRows();
      router.refresh();
    } finally {
      setCancellingJobId(null);
    }
  };

  return (
    <div>
      {cancelError ? (
        <p className="mb-4 text-sm text-red-600" aria-live="polite">
          {cancelError}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">来源</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">进度</th>
              <th className="px-4 py-3 font-medium">详情</th>
              <th className="px-4 py-3 font-medium">创建</th>
              <th className="px-4 py-3 font-medium">更新</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                  还没有下载记录。
                </td>
              </tr>
            ) : (
              rows.map((job) => {
                const percent = progressPercent(job);
                const countText =
                  job.progressTotal && job.progressTotal > 0
                    ? `${job.progressCurrent ?? 0}/${job.progressTotal}`
                    : null;
                const sourceLabel = `${job.sourceType.toUpperCase()} ${job.sourceId}`;

                return (
                  <tr key={job.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{job.id}</td>
                    <td className="px-4 py-3">
                      {job.sourceType === "set" ? (
                        <Link
                          href={`/sets/${encodeURIComponent(job.sourceId)}`}
                          className="font-medium text-blue-700 underline-offset-2 hover:underline"
                        >
                          {sourceLabel}
                        </Link>
                      ) : job.sourceType === "moc" ? (
                        <Link
                          href={`/mocs/${encodeURIComponent(job.sourceId)}`}
                          className="font-medium text-blue-700 underline-offset-2 hover:underline"
                        >
                          {sourceLabel}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-800">{sourceLabel}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={job.status}>{job.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className="text-slate-700">
                          {job.progressStage ?? job.message ?? "—"}
                        </span>
                        {countText ? (
                          <span className="block text-xs text-slate-500">
                            {countText}
                            {percent !== null ? ` · ${percent}%` : ""}
                          </span>
                        ) : null}
                        {percent !== null ? (
                          <div className="h-1.5 max-w-[140px] overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-slate-600">
                      <span className="line-clamp-3 break-words">
                        {job.progressDetail ?? job.message ?? "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(job.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(job.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {job.status === "pending" || job.status === "running" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          disabled={cancellingJobId === job.id}
                          onClick={() => void cancelJob(job.id)}
                        >
                          {cancellingJobId === job.id ? "取消中…" : "取消"}
                        </Button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
