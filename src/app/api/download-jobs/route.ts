import { cancelDownloadJob, getLatestDownloadJobs } from "@/lib/rebrickable/downloads";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    jobs: getLatestDownloadJobs(),
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = Number(body?.jobId);

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return Response.json({ message: "下载任务 ID 无效。" }, { status: 400 });
  }

  const result = cancelDownloadJob(jobId);

  return Response.json(result, { status: result.ok ? 200 : 409 });
}
