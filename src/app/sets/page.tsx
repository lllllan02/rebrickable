import Link from "next/link";
import { ArrowLeft, Box, ExternalLink } from "lucide-react";

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

export default function SetsPage() {
  const { count, sets } = getSetListData();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-8 text-white md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-slate-300">本地数据库</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">套装列表</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              查看已经下载到本地 SQLite 的 LEGO 套装。
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 px-5 py-4">
            <p className="text-sm text-slate-300">已下载套装</p>
            <p className="mt-1 text-3xl font-bold">{count}</p>
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
            回到首页输入 Set ID 下载数据后，这里会显示完整套装列表。
          </CardDescription>
        </Card>
      ) : (
        <section className="grid gap-4">
          {sets.map((set) => (
            <Card key={set.setNum} className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Box className="h-7 w-7" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="truncate">{set.name}</CardTitle>
                  {set.year ? <Badge>{set.year}</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {set.setNum} · {set.numParts ?? 0} parts
                  {set.themeName ? ` · ${set.themeName}` : ""}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  下载时间：{formatDate(set.downloadedAt)}
                </p>
              </div>
              {set.rebrickableUrl ? (
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/sets/${set.setNum}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-950 transition-colors hover:text-slate-500"
                  >
                    查看本地详情
                  </Link>
                  <Link
                    href={set.rebrickableUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
                  >
                    Rebrickable
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <Link
                  href={`/sets/${set.setNum}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-950 transition-colors hover:text-slate-500"
                >
                  查看本地详情
                </Link>
              )}
            </Card>
          ))}
        </section>
      )}
    </main>
  );
}
