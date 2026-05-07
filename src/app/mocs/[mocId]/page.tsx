import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Download, ExternalLink, Layers } from "lucide-react";

import { MocDownloadForm } from "@/app/moc-download-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getMocDetailData } from "@/lib/rebrickable/downloads";

export const dynamic = "force-dynamic";

type MocDetailPageProps = {
  params: Promise<{ mocId: string }>;
  searchParams: Promise<{
    section?: string | string[];
    partPage?: string | string[];
  }>;
};

type DetailSection = "overview" | "parts" | "raw";

const partPageSize = 40;

const detailSections: Array<{
  id: DetailSection;
  title: string;
  description: string;
}> = [
  {
    id: "overview",
    title: "概要",
    description: "元数据与下载说明",
  },
  {
    id: "parts",
    title: "零件清单",
    description: "本地已缓存的 MOC 零件",
  },
  {
    id: "raw",
    title: "原始 JSON",
    description: "Alternate 摘要原始数据",
  },
];

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

function formatRawJson(value: string | null) {
  if (!value) {
    return "无原始 JSON";
  }

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function mocCode(moc: { mocId: number; rawJson: string | null }) {
  if (moc.rawJson) {
    try {
      const raw = JSON.parse(moc.rawJson) as { set_num?: string };

      if (raw.set_num) {
        return raw.set_num;
      }
    } catch {
      // Fall back below.
    }
  }

  return `MOC-${moc.mocId}`;
}

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function selectedSection(value: string | string[] | undefined): DetailSection {
  const section = firstSearchValue(value);

  return detailSections.some((item) => item.id === section)
    ? (section as DetailSection)
    : "overview";
}

function pageNumber(value: string | string[] | undefined, totalPages: number) {
  const parsed = Number(firstSearchValue(value));
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

  return Math.min(page, Math.max(totalPages, 1));
}

function pageSlice<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;

  return items.slice(start, start + pageSize);
}

function detailHref(
  mocId: number,
  params: {
    section: DetailSection;
    partPage?: number;
  },
) {
  const search = new URLSearchParams();

  if (params.section !== "overview") {
    search.set("section", params.section);
  }

  if (params.partPage && params.partPage > 1) {
    search.set("partPage", String(params.partPage));
  }

  const query = search.toString();

  return `/mocs/${mocId}${query ? `?${query}` : ""}`;
}

function Pagination({
  currentPage,
  totalItems,
  pageSize,
  hrefForPage,
}: {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  hrefForPage: (page: number) => string;
}) {
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (page) =>
      page === 1 ||
      page === totalPages ||
      Math.abs(page - currentPage) <= 1,
  );

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 text-sm">
      <p className="text-slate-500">
        第 {formatNumber(currentPage)} / {formatNumber(totalPages)} 页
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefForPage(Math.max(currentPage - 1, 1))}
          scroll={false}
          aria-disabled={currentPage === 1}
          className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition-colors hover:text-slate-950 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          上一页
        </Link>
        {pages.map((page, index) => {
          const previous = pages[index - 1];

          return (
            <span key={page} className="flex items-center gap-2">
              {previous && page - previous > 1 ? (
                <span className="px-1 text-slate-400">...</span>
              ) : null}
              <Link
                href={hrefForPage(page)}
                scroll={false}
                aria-current={page === currentPage ? "page" : undefined}
                className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition-colors hover:text-slate-950 aria-current:border-slate-950 aria-current:bg-slate-950 aria-current:text-white"
              >
                {page}
              </Link>
            </span>
          );
        })}
        <Link
          href={hrefForPage(Math.min(currentPage + 1, totalPages))}
          scroll={false}
          aria-disabled={currentPage === totalPages}
          className="rounded-lg border border-slate-200 px-3 py-2 font-medium text-slate-600 transition-colors hover:text-slate-950 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          下一页
        </Link>
      </div>
    </nav>
  );
}

export default async function MocDetailPage({ params, searchParams }: MocDetailPageProps) {
  const { mocId: mocIdParam } = await params;
  const query = await searchParams;
  const data = getMocDetailData(mocIdParam);

  if (!data) {
    notFound();
  }

  const { moc } = data;
  const mocId = moc.mocId;
  const activeSection = selectedSection(query.section);
  const totalParts = data.inventory.reduce((sum, item) => sum + item.quantity, 0);
  const spareRows = data.inventory.filter((item) => item.isSpare).length;
  const mocRawJson = formatRawJson(moc.rawJson);
  const partTotalPages = Math.max(Math.ceil(data.inventory.length / partPageSize), 1);
  const partPage = pageNumber(query.partPage, partTotalPages);
  const pagedParts = pageSlice(data.inventory, partPage, partPageSize);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4">
        <div className="grid overflow-hidden rounded-3xl bg-slate-950 text-white lg:grid-cols-[360px_1fr]">
          <div className="flex min-h-80 items-center justify-center bg-white p-8">
            {moc.imageUrl ? (
              <div className="relative h-72 w-full">
                <Image
                  src={moc.imageUrl}
                  alt={moc.name}
                  fill
                  priority
                  sizes="360px"
                  className="object-contain"
                />
              </div>
            ) : (
              <Layers className="h-20 w-20 text-slate-300" />
            )}
          </div>
          <div className="flex flex-col justify-between gap-8 p-8">
            <div>
              <p className="text-sm font-medium text-slate-300">{mocCode(moc)}</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">{moc.name}</h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                本地缓存的 Alternate MOC 摘要与零件记录（若有）。按 MOC ID 的远程下载受 Rebrickable
                API 限制。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>MOC-{moc.mocId}</Badge>
              <Badge>{moc.buildStatus}</Badge>
              {moc.sourceSetNum ? (
                <Badge className="border border-white/30 bg-transparent text-white">
                  来源 {moc.sourceSetNum}
                </Badge>
              ) : null}
              <Badge>{formatDate(moc.downloadedAt ?? moc.updatedAt)}</Badge>
            </div>
          </div>
        </div>
      </header>

      <nav className="grid gap-3 md:grid-cols-3" aria-label="详情面板">
        {detailSections.map((section) => (
          <Link
            key={section.id}
            href={detailHref(mocId, { section: section.id })}
            scroll={false}
            aria-current={activeSection === section.id ? "page" : undefined}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 aria-current:border-slate-950 aria-current:bg-slate-950 aria-current:text-white"
          >
            <span className="block text-base font-semibold">{section.title}</span>
            <span className="mt-1 block text-sm text-slate-500 aria-current:text-slate-300">
              {section.description}
            </span>
          </Link>
        ))}
      </nav>

      {activeSection === "overview" ? (
        <section className="flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="grid gap-4">
              <Card>
                <CardDescription>摘要零件数</CardDescription>
                <p className="mt-3 text-4xl font-bold">{formatNumber(moc.numParts)}</p>
              </Card>
              <Card>
                <CardDescription>本地零件记录</CardDescription>
                <p className="mt-3 text-4xl font-bold">{formatNumber(data.inventory.length)}</p>
              </Card>
              <Card>
                <CardDescription>零件数量合计</CardDescription>
                <p className="mt-3 text-4xl font-bold">{formatNumber(totalParts)}</p>
              </Card>
            </div>

            <Card>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                <CardTitle>MOC 信息</CardTitle>
              </div>
              <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-slate-500">显示编号</dt>
                  <dd className="font-medium text-slate-950">{mocCode(moc)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">作者</dt>
                  <dd className="font-medium text-slate-950">{moc.designerName ?? "未知"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">备用记录行</dt>
                  <dd className="font-medium text-slate-950">{formatNumber(spareRows)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">数据库 ID</dt>
                  <dd className="font-medium text-slate-950">{moc.mocId}</dd>
                </div>
                {data.latestJob?.message ? (
                  <div className="md:col-span-2">
                    <dt className="text-slate-500">最近 MOC 下载任务</dt>
                    <dd className="font-medium text-slate-950">{data.latestJob.message}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
                <Link
                  href={detailHref(mocId, { section: "parts" })}
                  scroll={false}
                  className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
                >
                  查看零件清单
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
                    来源套装详情
                    <Box className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              <CardTitle>下载 / 校验</CardTitle>
            </div>
            <CardDescription>
              按 MOC ID 创建任务时，会在「下载记录」中标记失败并说明原因（官方 API 不提供 MOC
              零件端点）。与首页行为一致。
            </CardDescription>
            <MocDownloadForm presetMocId={String(moc.mocId)} lockMocId />
          </Card>
        </section>
      ) : null}

      {activeSection === "parts" ? (
        <Card>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <CardTitle>零件清单</CardTitle>
              <CardDescription>
                共 {formatNumber(data.inventory.length)} 条记录，每页 {formatNumber(partPageSize)}{" "}
                条。若无数据，表示尚未向本地 moc_parts 表写入零件行。
              </CardDescription>
            </div>
            <Badge>
              第 {formatNumber(partPage)} / {formatNumber(partTotalPages)} 页
            </Badge>
          </div>
          {data.inventory.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">
              当前 MOC 没有本地零件清单。Rebrickable API v3 不支持按 MOC ID 下载清单；若未来扩展管道写入
              moc_parts 表，将在此展示。
            </p>
          ) : (
            <>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-3 pr-4 font-medium">零件</th>
                      <th className="py-3 pr-4 font-medium">颜色</th>
                      <th className="py-3 pr-4 font-medium">数量</th>
                      <th className="py-3 pr-4 font-medium">分类</th>
                      <th className="py-3 pr-4 font-medium">备用</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedParts.map((item) => (
                      <tr key={`${item.partNum}-${item.colorName}-${item.isSpare}`}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                              {item.imageUrl ? (
                                <div className="relative h-12 w-12">
                                  <Image
                                    src={item.imageUrl}
                                    alt={item.partName}
                                    fill
                                    sizes="48px"
                                    className="object-contain"
                                  />
                                </div>
                              ) : (
                                <Box className="h-5 w-5 text-slate-300" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-slate-950">{item.partName}</p>
                              <p className="text-xs text-slate-500">{item.partNum}</p>
                            </div>
                          </div>
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
                        <td className="py-3 pr-4 text-slate-500">
                          {item.partCategoryName ?? "-"}
                        </td>
                        <td className="py-3 pr-4 text-slate-500">{item.isSpare ? "是" : "否"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={partPage}
                totalItems={data.inventory.length}
                pageSize={partPageSize}
                hrefForPage={(page) => detailHref(mocId, { section: "parts", partPage: page })}
              />
            </>
          )}
        </Card>
      ) : null}

      {activeSection === "raw" ? (
        <Card>
          <CardTitle>原始 JSON</CardTitle>
          <CardDescription>保存到 SQLite 的 Alternate 摘要字段，便于核对来源数据。</CardDescription>
          <pre className="mt-5 max-h-[640px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
            {mocRawJson}
          </pre>
        </Card>
      ) : null}
    </main>
  );
}
