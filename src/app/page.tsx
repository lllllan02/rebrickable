import { Box, Database, Download, Settings } from "lucide-react";

import {
  downloadMocAction,
  downloadSetAction,
  saveApiKeyAction,
} from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  const { counts, latestJobs, latestMocs, latestSets } = getDashboardData();

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
            输入 Set ID 下载官方套装、零件清单和 Alternate MOC 摘要到本地数据库。
            MOC ID 入口会明确提示 Rebrickable API 的官方限制。
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
          <CardDescription>MOC 摘要</CardDescription>
          <p className="mt-3 text-4xl font-bold">{counts.mocs}</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            <CardTitle>API 设置</CardTitle>
          </div>
          <CardDescription>
            API Key 会保存在本地 SQLite，也可以使用环境变量 REBRICKABLE_API_KEY。
          </CardDescription>
          <form action={saveApiKeyAction} className="mt-5 flex flex-col gap-3">
            <Input name="apiKey" type="password" placeholder="Rebrickable API Key" />
            <Button type="submit">保存 API Key</Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            <CardTitle>下载套装</CardTitle>
          </div>
          <CardDescription>
            支持 10316-1 这种完整 Set ID；如果只输入数字，会自动补为 -1。
          </CardDescription>
          <form action={downloadSetAction} className="mt-5 flex flex-col gap-3">
            <Input name="setNum" placeholder="例如 10316-1" />
            <Button type="submit">下载 Set 数据</Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            <CardTitle>下载 MOC</CardTitle>
          </div>
          <CardDescription>
            Rebrickable API v3 不支持按 MOC ID 下载零件清单；这里会记录失败任务和原因。
          </CardDescription>
          <form action={downloadMocAction} className="mt-5 flex flex-col gap-3">
            <Input name="mocId" placeholder="例如 123456" />
            <Button type="submit" variant="secondary">
              检查 MOC ID
            </Button>
          </form>
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
          <CardTitle>最近 MOC 摘要</CardTitle>
          <div className="mt-4 divide-y divide-slate-100">
            {latestMocs.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                通过下载 Set 可缓存它的 Alternate MOC 摘要。
              </p>
            ) : (
              latestMocs.map((moc) => (
                <div key={moc.mocId} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{moc.name}</p>
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

      <Card>
        <CardTitle>下载记录</CardTitle>
        <div className="mt-4 divide-y divide-slate-100">
          {latestJobs.length === 0 ? (
            <p className="py-6 text-sm text-slate-500">还没有下载记录。</p>
          ) : (
            latestJobs.map((job) => (
              <div key={job.id} className="grid gap-2 py-3 md:grid-cols-[160px_120px_1fr]">
                <div className="text-sm font-medium">
                  {job.sourceType.toUpperCase()} {job.sourceId}
                </div>
                <Badge tone={job.status}>{job.status}</Badge>
                <p className="text-sm text-slate-600">{job.message}</p>
              </div>
            ))
          )}
        </div>
      </Card>
    </main>
  );
}
