"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";

export type DownloadJobItem = {
  id: number;
  sourceType: "set" | "moc";
  sourceId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  message: string | null;
  progressStage: string | null;
  progressCurrent: number | null;
  progressTotal: number | null;
  progressDetail: string | null;
  updatedAt: string;
};

type DownloadJobsPanelProps = {
  initialJobs: DownloadJobItem[];
};

function hasActiveJob(jobs: DownloadJobItem[]) {
  return jobs.some((job) => job.status === "pending" || job.status === "running");
}

function progressPercent(job: DownloadJobItem) {
  if (!job.progressTotal || job.progressTotal <= 0 || job.progressCurrent === null) {
    return null;
  }

  return Math.min(100, Math.round((job.progressCurrent / job.progressTotal) * 100));
}

export function DownloadJobsPanel({ initialJobs }: DownloadJobsPanelProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [cancellingJobId, setCancellingJobId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState("");
  const hadActiveJob = useRef(hasActiveJob(initialJobs));
  const active = hasActiveJob(jobs);
  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/download-jobs", { cache: "no-store" });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { jobs: DownloadJobItem[] };
    setJobs(data.jobs);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setJobs(initialJobs);
      }
    });

    return () => {
      controller.abort();
    };
  }, [initialJobs]);

  useEffect(() => {
    if (!active && hadActiveJob.current) {
      router.refresh();
    }

    hadActiveJob.current = active;
  }, [active, router]);

  useEffect(() => {
    window.addEventListener("download-jobs:refresh", loadJobs);

    return () => {
      window.removeEventListener("download-jobs:refresh", loadJobs);
    };
  }, [loadJobs]);

  useEffect(() => {
    if (!active) {
      return;
    }

    const timer = window.setInterval(loadJobs, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [active, loadJobs]);

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

      await loadJobs();
      router.refresh();
    } finally {
      setCancellingJobId(null);
    }
  };

  return (
    <Card>
      <CardTitle>下载记录</CardTitle>
      {cancelError ? (
        <p className="mt-3 text-sm text-red-600" aria-live="polite">
          {cancelError}
        </p>
      ) : null}
      <div className="mt-4 divide-y divide-slate-100">
        {jobs.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">还没有下载记录。</p>
        ) : (
          jobs.map((job) => {
            const percent = progressPercent(job);
            const countText =
              job.progressTotal && job.progressTotal > 0
                ? `${job.progressCurrent ?? 0}/${job.progressTotal}`
                : null;

            return (
              <div key={job.id} className="grid gap-3 py-3 md:grid-cols-[160px_120px_1fr_auto]">
                <div className="text-sm font-medium">
                  {job.sourceType.toUpperCase()} {job.sourceId}
                </div>
                <Badge tone={job.status}>{job.status}</Badge>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium text-slate-700">
                      {job.progressStage ?? job.message ?? "等待更新"}
                    </span>
                    {countText ? (
                      <span className="text-slate-500">
                        {countText}
                        {percent !== null ? ` · ${percent}%` : ""}
                      </span>
                    ) : null}
                  </div>
                  {percent !== null ? (
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  ) : null}
                  <p className="text-sm text-slate-600">
                    {job.progressDetail ?? job.message}
                  </p>
                </div>
                {job.status === "pending" || job.status === "running" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cancellingJobId === job.id}
                    onClick={() => void cancelJob(job.id)}
                  >
                    {cancellingJobId === job.id ? "取消中..." : "取消"}
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
