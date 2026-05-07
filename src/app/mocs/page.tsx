import Image from "next/image";
import Link from "next/link";
import { Box, ExternalLink, Layers } from "lucide-react";

import { MocDownloadForm } from "@/app/moc-download-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getMocListData } from "@/lib/rebrickable/downloads";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  if (!value) {
    return "未记录";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

export default function MocsPage() {
  const { count, mocs } = getMocListData();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start sm:gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-300">本地数据库</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">MOC 摘要列表</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                当前条目主要来自已下载套装的 Alternate MOC 摘要。Rebrickable API v3
                不支持按 MOC ID 拉取零件清单；下方「检查」会在下载记录中留下失败说明。
              </p>
            </div>
            <div className="shrink-0 rounded-2xl bg-white/10 px-4 py-3 md:px-5 md:py-4">
              <p className="text-sm text-slate-300">已缓存 MOC</p>
              <p className="mt-0.5 text-2xl font-bold tabular-nums md:text-3xl">{formatNumber(count)}</p>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4 md:pt-5">
            <MocDownloadForm layout="toolbar" />
          </div>
        </div>
      </header>

      {mocs.length === 0 ? (
        <Card>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            <CardTitle>还没有 MOC 摘要</CardTitle>
          </div>
          <CardDescription>
            请先在「套装列表」下载任意套装；套装的 Alternate MOC 会写入本表。也可使用页头表单验证
            MOC ID（会记录 API 限制说明）。
          </CardDescription>
        </Card>
      ) : (
        <section className="grid gap-5">
          {mocs.map((moc, index) => (
            <Card
              key={moc.mocId}
              className="overflow-hidden p-0 transition-shadow hover:shadow-md"
            >
              <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
                <Link
                  href={`/mocs/${moc.mocId}`}
                  className="flex min-h-64 items-center justify-center bg-slate-100 p-6"
                >
                  {moc.imageUrl ? (
                    <div className="relative h-56 w-full">
                      <Image
                        src={moc.imageUrl}
                        alt={moc.name}
                        fill
                        priority={index === 0}
                        sizes="280px"
                        className="object-contain"
                      />
                    </div>
                  ) : (
                    <Layers className="h-16 w-16 text-slate-400" />
                  )}
                </Link>

                <div className="flex flex-col gap-6 p-6">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-2xl">{moc.name}</CardTitle>
                        <Badge>MOC-{moc.mocId}</Badge>
                        <Badge>{moc.buildStatus}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {moc.designerName ? `${moc.designerName} · ` : null}
                        官方摘要 {formatNumber(moc.numParts)} parts
                        {moc.sourceSetNum ? ` · 来源套装 ${moc.sourceSetNum}` : null}
                      </p>
                    </div>
                    <p className="text-sm text-slate-500">
                      更新时间：{formatDate(moc.updatedAt ?? moc.downloadedAt)}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">本地零件记录</p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {formatNumber(moc.inventory.rowCount)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">清单数量合计</p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {formatNumber(moc.inventory.quantity)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs text-slate-500">备用记录</p>
                      <p className="mt-1 text-2xl font-bold text-slate-950">
                        {formatNumber(moc.inventory.spareRows)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-4 border-t border-slate-100 pt-5 md:flex-row md:items-center">
                    <p className="text-sm text-slate-500">
                      {moc.inventory.rowCount === 0
                        ? "尚无本地 MOC 零件清单（API 不提供按 MOC 下载）。"
                        : "已缓存部分零件清单，可在详情页查看。"}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/mocs/${moc.mocId}`}
                        className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
                      >
                        查看详情
                      </Link>
                      {moc.rebrickableUrl ? (
                        <Link
                          href={moc.rebrickableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                        >
                          Rebrickable
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      ) : null}
                      {moc.sourceSetNum ? (
                        <Link
                          href={`/sets/${encodeURIComponent(moc.sourceSetNum)}`}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                        >
                          来源套装
                          <Box className="h-4 w-4" />
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
