import Link from "next/link";
import { Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { dbPath } from "@/db/client";
import { getDashboardData } from "@/lib/rebrickable/downloads";

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

export default function Home() {
  const { counts, latestMocs, latestSets } = getDashboardData();

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-8 text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Database className="h-4 w-4" />
          <span>SQLite: {dbPath}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-300">本地优先</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            LEGO 套装与 MOC 管理
          </h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            在已下载套装的详情页可重新拉取官方数据与零件清单；MOC 数据请在网页导出后通过「MOC
            导入」上传至本地数据库。
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardDescription>套装</CardDescription>
          <p className="mt-3 text-4xl font-bold">{counts.sets}</p>
        </Card>
        <Card>
          <CardDescription>零件</CardDescription>
          <p className="mt-3 text-4xl font-bold">{counts.parts}</p>
        </Card>
        <Card>
          <CardDescription>MOC</CardDescription>
          <p className="mt-3 text-4xl font-bold">{counts.mocs}</p>
          <div className="mt-3 flex flex-col gap-1 text-sm font-medium text-blue-700">
            <Link href="/mocs" className="hover:underline">
              打开 MOC 列表
            </Link>
            <Link href="/moc-import" className="hover:underline">
              导入 MOC 清单
            </Link>
          </div>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>最近套装</CardTitle>
          <div className="mt-4 divide-y divide-slate-100">
            {latestSets.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">还没有下载套装。</p>
            ) : (
              latestSets.map((set) => (
                <div key={set.setNum} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{set.name}</p>
                    <p className="text-sm text-slate-500">
                      {set.setNum} · {set.numParts ?? 0} parts
                    </p>
                  </div>
                  <span className="text-sm text-slate-500">
                    {formatDate(set.downloadedAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardTitle>最近 MOC</CardTitle>
          <div className="mt-4 divide-y divide-slate-100">
            {latestMocs.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                尚无 MOC。请使用「MOC 导入」从网页导出文件后写入本地。
              </p>
            ) : (
              latestMocs.map((moc) => (
                <div key={moc.mocId} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/mocs/${moc.mocId}`}
                      className="font-medium text-slate-950 hover:underline"
                    >
                      {moc.name}
                    </Link>
                    <p className="text-sm text-slate-500">
                      MOC-{moc.mocId} · {moc.numParts ?? 0} parts
                    </p>
                  </div>
                  <Badge>{moc.buildStatus}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </main>
  );
}
