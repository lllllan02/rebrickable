import Link from "next/link";
import { Download } from "lucide-react";

import { Card, CardDescription } from "@/components/ui/card";
import {
  getDownloadJobsPaginated,
  getDownloadJobsTotalCount,
} from "@/lib/rebrickable/downloads";

import { DownloadJobsHistoryTable, type DownloadHistoryRow } from "./download-jobs-history-table";

export const dynamic = "force-dynamic";

const pageSize = 25;

type DownloadJobsPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberSearchValue(value: string | string[] | undefined) {
  const parsed = Number(firstSearchValue(value));

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function Pagination({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1,
  );

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-slate-500">
        第 {formatNumber(page)} / {formatNumber(totalPages)} 页
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefForPage(Math.max(page - 1, 1))}
          scroll={false}
          aria-disabled={page === 1}
          className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition-colors hover:text-slate-950 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          上一页
        </Link>
        {pages.map((item, index) => {
          const previous = pages[index - 1];

          return (
            <span key={item} className="flex items-center gap-2">
              {previous && item - previous > 1 ? (
                <span className="px-1 text-slate-400">...</span>
              ) : null}
              <Link
                href={hrefForPage(item)}
                scroll={false}
                aria-current={item === page ? "page" : undefined}
                className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition-colors hover:text-slate-950 aria-current:border-slate-950 aria-current:bg-slate-950 aria-current:text-white"
              >
                {item}
              </Link>
            </span>
          );
        })}
        <Link
          href={hrefForPage(Math.min(page + 1, totalPages))}
          scroll={false}
          aria-disabled={page === totalPages}
          className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition-colors hover:text-slate-950 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          下一页
        </Link>
      </div>
    </nav>
  );
}

function hrefForPage(page: number) {
  if (page <= 1) {
    return "/download-jobs";
  }

  return `/download-jobs?page=${page}`;
}

export default async function DownloadJobsPage({ searchParams }: DownloadJobsPageProps) {
  const query = await searchParams;
  const requestedPage = numberSearchValue(query.page) ?? 1;
  const total = getDownloadJobsTotalCount();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const jobRows = getDownloadJobsPaginated(page, pageSize);

  const initialRows: DownloadHistoryRow[] = jobRows.map((job) => ({
    id: job.id,
    sourceType: job.sourceType,
    sourceId: job.sourceId,
    status: job.status,
    message: job.message,
    progressStage: job.progressStage,
    progressCurrent: job.progressCurrent,
    progressTotal: job.progressTotal,
    progressDetail: job.progressDetail,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  }));

  const tableKey = initialRows.map((j) => `${j.id}:${j.updatedAt}:${j.status}`).join("|");

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-8 text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Download className="h-4 w-4" />
          <span>SQLite 任务表 · download_jobs</span>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-300">历史与进度</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">下载记录</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            查看套装与零件目录相关的后台下载任务，包含状态、进度条摘要与时间戳；进行中的任务会每秒自动刷新本页数据。
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardDescription>任务总数</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(total)}</p>
        </Card>
        <Card>
          <CardDescription>每页条数</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(pageSize)}</p>
        </Card>
        <Card>
          <CardDescription>当前页码</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(page)}</p>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">任务列表</h2>
            <p className="mt-1 text-sm text-slate-500">
              SET 来源可点击跳转到套装详情；取消仅对排队中或运行中的任务有效。
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
          >
            返回首页
          </Link>
        </div>

        <DownloadJobsHistoryTable
          key={tableKey || `empty-${page}`}
          initialRows={initialRows}
          page={page}
          pageSize={pageSize}
        />

        <Pagination page={page} totalPages={totalPages} hrefForPage={hrefForPage} />
      </section>
    </main>
  );
}
