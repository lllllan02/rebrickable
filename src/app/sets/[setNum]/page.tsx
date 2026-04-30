import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getSetDetailData } from "@/lib/rebrickable/downloads";

export const dynamic = "force-dynamic";

type SetDetailPageProps = {
  params: Promise<{ setNum: string }>;
};

function formatDate(value: Date | null) {
  if (!value) {
    return "未下载";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function SetDetailPage({ params }: SetDetailPageProps) {
  const { setNum } = await params;
  const data = getSetDetailData(setNum);

  if (!data) {
    notFound();
  }

  const totalParts = data.inventory.reduce((sum, item) => sum + item.quantity, 0);
  const spareRows = data.inventory.filter((item) => item.isSpare).length;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/sets"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          返回套装列表
        </Link>
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-8 text-white md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-slate-300">{data.set.setNum}</p>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">{data.set.name}</h1>
            <p className="mt-3 max-w-2xl text-slate-300">
              这里展示已经保存到本地 SQLite 的套装信息和零件清单。
            </p>
          </div>
          {data.set.year ? <Badge>{data.set.year}</Badge> : null}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardDescription>零件记录</CardDescription>
          <p className="mt-3 text-4xl font-bold">{data.inventory.length}</p>
        </Card>
        <Card>
          <CardDescription>零件总数</CardDescription>
          <p className="mt-3 text-4xl font-bold">{totalParts}</p>
        </Card>
        <Card>
          <CardDescription>备用零件记录</CardDescription>
          <p className="mt-3 text-4xl font-bold">{spareRows}</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <div className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            <CardTitle>下载内容</CardTitle>
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div>
              <dt className="text-slate-500">套装编号</dt>
              <dd className="font-medium text-slate-950">{data.set.setNum}</dd>
            </div>
            <div>
              <dt className="text-slate-500">官方零件数</dt>
              <dd className="font-medium text-slate-950">{data.set.numParts ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">主题 ID</dt>
              <dd className="font-medium text-slate-950">{data.set.themeId ?? "未知"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">下载时间</dt>
              <dd className="font-medium text-slate-950">
                {formatDate(data.set.downloadedAt)}
              </dd>
            </div>
            {data.latestJob?.message ? (
              <div>
                <dt className="text-slate-500">最近下载记录</dt>
                <dd className="font-medium text-slate-950">{data.latestJob.message}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            {data.set.rebrickableUrl ? (
              <Link
                href={data.set.rebrickableUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
              >
                Rebrickable
                <ExternalLink className="h-4 w-4" />
              </Link>
            ) : null}
            {data.set.imageUrl ? (
              <Link
                href={data.set.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
              >
                图片链接
                <ExternalLink className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardTitle>零件清单</CardTitle>
          <CardDescription>
            每行是本地保存的一条套装零件记录，包含零件号、颜色、数量和 Element ID。
          </CardDescription>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4 font-medium">零件</th>
                  <th className="py-3 pr-4 font-medium">颜色</th>
                  <th className="py-3 pr-4 font-medium">数量</th>
                  <th className="py-3 pr-4 font-medium">Element ID</th>
                  <th className="py-3 pr-4 font-medium">备用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.inventory.map((item) => (
                  <tr key={`${item.partNum}-${item.colorName}-${item.isSpare}`}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-950">{item.partName}</p>
                      <p className="text-xs text-slate-500">{item.partNum}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {item.colorRgb ? (
                          <span
                            className="h-4 w-4 rounded-full border border-slate-200"
                            style={{ backgroundColor: `#${item.colorRgb}` }}
                          />
                        ) : null}
                        <span>{item.colorName}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 font-medium">{item.quantity}</td>
                    <td className="py-3 pr-4 text-slate-500">{item.elementId ?? "-"}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {item.isSpare ? "是" : "否"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </main>
  );
}
