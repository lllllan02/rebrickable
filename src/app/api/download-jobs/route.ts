import {
  cancelDownloadJob,
  getDownloadJobsPaginated,
  getDownloadJobsTotalCount,
  getLatestDownloadJobs,
} from "@/lib/rebrickable/downloads";

export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number) {
  const n = Number(value);

  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const pageParam = url.searchParams.get("page");

  if (pageParam !== null) {
    const page = parsePositiveInt(pageParam, 1);
    const pageSize = parsePositiveInt(url.searchParams.get("pageSize"), 20);
    const total = getDownloadJobsTotalCount();
    const jobs = getDownloadJobsPaginated(page, pageSize);

    return Response.json({
      jobs,
      total,
      page,
      pageSize: Math.min(Math.max(pageSize, 10), 100),
    });
  }

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
