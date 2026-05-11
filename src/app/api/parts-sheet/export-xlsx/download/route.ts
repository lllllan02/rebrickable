import { NextResponse } from "next/server";

import { consumeExportJobResult, getExportJob } from "@/lib/export-xlsx-job-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function contentDispositionAttachment(filename: string): string {
  const safeLegacy = /^[\x20-\x7E]+$/.test(filename);
  const legacy = safeLegacy
    ? filename.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    : "parts-sheet-export.xlsx";
  return `attachment; filename="${legacy}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(req: Request) {
  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "缺少 jobId。" }, { status: 400 });
  }

  const taken = consumeExportJobResult(jobId);
  if (taken) {
    const filename = `${taken.stem}.xlsx`;
    return new NextResponse(new Uint8Array(taken.buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": contentDispositionAttachment(filename),
      },
    });
  }

  const job = getExportJob(jobId);
  if (job?.status === "error") {
    return NextResponse.json(
      { error: job.errorMessage ?? "生成 Excel 失败。" },
      { status: 500 }
    );
  }
  if (job?.status === "running") {
    return NextResponse.json({ error: "文件尚未生成完毕。" }, { status: 409 });
  }

  return NextResponse.json({ error: "任务不存在或文件已下载。" }, { status: 404 });
}
