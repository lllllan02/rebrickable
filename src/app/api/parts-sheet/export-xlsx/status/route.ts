import { NextResponse } from "next/server";

import { getExportJob } from "@/lib/export-xlsx-job-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "缺少 jobId。" }, { status: 400 });
  }

  const job = getExportJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "任务不存在或已过期。" }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status,
    current: job.current,
    total: job.total,
    writingFile: job.writingFile,
    ...(job.errorMessage ? { error: job.errorMessage } : {}),
  });
}
