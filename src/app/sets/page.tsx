import Image from "next/image";
import Link from "next/link";
import { Box, ExternalLink, FileText } from "lucide-react";

import { SetDownloadForm } from "@/app/set-download-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getSetListData } from "@/lib/rebrickable/downloads";

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

export default function SetsPage() {
  const { count, sets } = getSetListData();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-300">本地数据库</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">套装列表</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                支持完整 Set ID（如 10316-1），纯数字会自动补 -1；进度在「下载记录」。下列表为已入库套装。
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/10 px-4 py-3 md:px-5 md:py-4">
              <p className="text-sm text-slate-300">已下载套装</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums md:text-3xl">{formatNumber(count)}</p>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4 md:pt-5">
            <SetDownloadForm layout="toolbar" />
          </div>
        </div>
      </header>

      {sets.length === 0 ? (
        <Card>
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            <CardTitle>还没有套装</CardTitle>
          </div>
          <CardDescription>
            使用页头中的下载表单创建任务，完成后刷新本页即可看到列表与详情入口。
          </CardDescription>
        </Card>
      ) : (
        <section className="grid gap-5">
          {sets.map((set, index) => (
            <Card
              key={set.setNum}
              className="overflow-hidden p-0 transition-shadow hover:shadow-md"
            >
              <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                <Link
                  href={`/sets/${set.setNum}`}
                  className="flex min-h-64 items-center justify-center bg-slate-100 p-6"
                >
                  {set.imageUrl ? (
                    <div className="relative h-56 w-full">
                      <Image
                        src={set.imageUrl}
                        alt={set.name}
                        fill
                        priority={index === 0}
                        sizes="280px"
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <Box className="h-16 w-16 text-slate-400" />
                  )}
                </Link>

                <div className="flex flex-col gap-6 p-6">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-2xl">{set.name}</CardTitle>
                        {set.year ? <Badge>{set.year}</Badge> : null}
                        {set.themeName ? <Badge>{set.themeName}</Badge> : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {set.setNum} · 官方 {formatNumber(set.numParts)} parts
                      </p>
                    </div>
                    <p className="text-sm text-slate-500">
                      下载时间：{formatDate(set.downloadedAt)}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">零件记录</p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {formatNumber(set.inventory.rowCount)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">清单总量</p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {formatNumber(set.inventory.quantity)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">备用记录</p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {formatNumber(set.inventory.spareRows)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-4 border-t border-slate-100 pt-5 md:flex-row md:items-center">
                    <div className="flex flex-wrap gap-3 text-sm">
                      <Link
                        href={`${set.assetBaseUrl}/inventory.json`}
                        target="_blank"
                        className="inline-flex items-center gap-2 font-medium text-slate-500 transition-colors hover:text-slate-950"
                      >
                        <FileText className="h-4 w-4" />
                        inventory.json
                      </Link>
                      <Link
                        href={`${set.assetBaseUrl}/inventory.csv`}
                        target="_blank"
                        className="inline-flex items-center gap-2 font-medium text-slate-500 transition-colors hover:text-slate-950"
                      >
                        <FileText className="h-4 w-4" />
                        inventory.csv
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/sets/${set.setNum}`}
                        className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
                      >
                        查看下载内容
                      </Link>
                      {set.rebrickableUrl ? (
                        <Link
                          href={set.rebrickableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                        >
                          Rebrickable
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </section>
      )}
    </main>
  );
}
