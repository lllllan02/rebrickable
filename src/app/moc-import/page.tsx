import { Download, FileSpreadsheet, Palette } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getLatestDownloadJobs, getPartCatalogSummary } from "@/lib/rebrickable/downloads";
import { DownloadJobsPanel, type DownloadJobItem } from "../download-jobs-panel";
import { CatalogDownloadForm } from "./catalog-download-form";
import { MocImportForm } from "./moc-import-form";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) {
    return "未下载";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

export default function MocImportPage() {
  const summary = getPartCatalogSummary();
  const downloadJobs: DownloadJobItem[] = getLatestDownloadJobs().map((job) => ({
    id: job.id,
    sourceType: job.sourceType,
    sourceId: job.sourceId,
    status: job.status,
    message: job.message,
    progressStage: job.progressStage,
    progressCurrent: job.progressCurrent,
    progressTotal: job.progressTotal,
    progressDetail: job.progressDetail,
    updatedAt: job.updatedAt.toISOString(),
  }));

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-8 text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <FileSpreadsheet className="h-4 w-4" />
          <span>MOC 零件清单过滤</span>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-300">导入高砖商城前处理</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">MOC 零件配色过滤</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            先缓存 Rebrickable 全量零件配色，再上传 MOC 零件 CSV。系统会保留有配色的行，
            对没有原配色但存在其他配色的零件改为可用配色，无法匹配的行会进入 rejected.csv。
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardDescription>本地零件</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(summary.partCount)}</p>
        </Card>
        <Card>
          <CardDescription>颜色</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(summary.colorCount)}</p>
        </Card>
        <Card>
          <CardDescription>零件配色</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(summary.partColorCount)}</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            <CardTitle>全量零件配色索引</CardTitle>
          </div>
          <CardDescription>
            通过 Rebrickable 逐个零件读取所有出现过的配色。首次下载会比较久，可在下载记录中取消。
          </CardDescription>
          <p className="mt-4 text-sm text-slate-500">
            最近索引任务：{formatDate(summary.latestCatalogJob?.updatedAt ?? null)}
          </p>
          <CatalogDownloadForm />
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            <CardTitle>过滤 MOC 清单</CardTitle>
          </div>
          <CardDescription>
            支持包含 part_num、color_id、quantity 列的 CSV；会输出 filtered-for-gobricks.csv
            和 rejected.csv。
          </CardDescription>
          <MocImportForm />
        </Card>
      </section>

      <DownloadJobsPanel initialJobs={downloadJobs} />
    </main>
  );
}
