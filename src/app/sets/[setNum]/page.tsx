import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Download, ExternalLink, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getSetDetailData } from "@/lib/rebrickable/downloads";
import { SetDownloadForm } from "@/app/set-download-form";

export const dynamic = "force-dynamic";

type SetDetailPageProps = {
  params: Promise<{ setNum: string }>;
  searchParams: Promise<{
    section?: string | string[];
    partPage?: string | string[];
    mocPage?: string | string[];
  }>;
};

type DetailSection = "overview" | "parts" | "mocs" | "raw";

const partPageSize = 40;
const mocPageSize = 12;
const detailSections: Array<{
  id: DetailSection;
  title: string;
  description: string;
}> = [
  {
    id: "overview",
    title: "下载内容",
    description: "套装信息、统计和本地文件",
  },
  {
    id: "parts",
    title: "零件清单",
    description: "分页查看本地零件记录",
  },
  {
    id: "mocs",
    title: "Alternate MOC",
    description: "分页查看可替换拼搭方案",
  },
  {
    id: "raw",
    title: "原始 JSON",
    description: "核对 API 响应内容",
  },
];

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
      // Fall back to the database id below.
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
  setNum: string,
  params: {
    section: DetailSection;
    partPage?: number;
    mocPage?: number;
  },
) {
  const search = new URLSearchParams();

  if (params.section !== "overview") {
    search.set("section", params.section);
  }

  if (params.partPage && params.partPage > 1) {
    search.set("partPage", String(params.partPage));
  }

  if (params.mocPage && params.mocPage > 1) {
    search.set("mocPage", String(params.mocPage));
  }

  const query = search.toString();

  return `/sets/${setNum}${query ? `?${query}` : ""}`;
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

export default async function SetDetailPage({ params, searchParams }: SetDetailPageProps) {
  const { setNum } = await params;
  const query = await searchParams;
  const data = getSetDetailData(setNum);

  if (!data) {
    notFound();
  }

  const activeSection = selectedSection(query.section);
  const totalParts = data.inventory.reduce((sum, item) => sum + item.quantity, 0);
  const spareRows = data.inventory.filter((item) => item.isSpare).length;
  const imageUrlCount = [
    data.set.imageUrl,
    ...data.inventory.map((item) => item.imageUrl),
    ...data.alternates.map((moc) => moc.imageUrl),
  ].filter(Boolean).length;
  const setRawJson = formatRawJson(data.set.rawJson);
  const partTotalPages = Math.max(Math.ceil(data.inventory.length / partPageSize), 1);
  const mocTotalPages = Math.max(Math.ceil(data.alternates.length / mocPageSize), 1);
  const partPage = pageNumber(query.partPage, partTotalPages);
  const mocPage = pageNumber(query.mocPage, mocTotalPages);
  const pagedParts = pageSlice(data.inventory, partPage, partPageSize);
  const pagedMocs = pageSlice(data.alternates, mocPage, mocPageSize);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4">
        <div className="grid overflow-hidden rounded-3xl bg-slate-950 text-white lg:grid-cols-[360px_1fr]">
          <div className="flex min-h-80 items-center justify-center bg-white p-8">
            {data.set.imageUrl ? (
              <div className="relative h-72 w-full">
                <Image
                  src={data.set.imageUrl}
                  alt={data.set.name}
                  fill
                  priority
                  sizes="360px"
                  className="object-contain"
                />
              </div>
            ) : (
              <Box className="h-20 w-20 text-slate-300" />
            )}
          </div>
          <div className="flex flex-col justify-between gap-8 p-8">
            <div>
              <p className="text-sm font-medium text-slate-300">{data.set.setNum}</p>
              <h1 className="mt-2 text-4xl font-bold tracking-tight">{data.set.name}</h1>
              <p className="mt-3 max-w-2xl text-slate-300">
                已下载的套装资料、清单文件、图片 URL 和 Alternate MOC 摘要都集中在这里。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.set.year ? <Badge>{data.set.year}</Badge> : null}
              {data.set.themeName ? <Badge>{data.set.themeName}</Badge> : null}
              <Badge>{formatDate(data.set.downloadedAt)}</Badge>
            </div>
          </div>
        </div>
      </header>

      <nav className="grid gap-3 md:grid-cols-4" aria-label="详情面板">
        {detailSections.map((section) => (
          <Link
            key={section.id}
            href={detailHref(setNum, { section: section.id })}
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
                <CardDescription>零件记录</CardDescription>
                <p className="mt-3 text-4xl font-bold">{formatNumber(data.inventory.length)}</p>
              </Card>
              <Card>
                <CardDescription>零件总数</CardDescription>
                <p className="mt-3 text-4xl font-bold">{formatNumber(totalParts)}</p>
              </Card>
              <Card>
                <CardDescription>Alternate MOC</CardDescription>
                <p className="mt-3 text-4xl font-bold">{formatNumber(data.alternates.length)}</p>
              </Card>
              <Card>
                <CardDescription>图片 URL</CardDescription>
                <p className="mt-3 text-4xl font-bold">{formatNumber(imageUrlCount)}</p>
              </Card>
            </div>

            <Card>
            <div className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              <CardTitle>下载内容</CardTitle>
            </div>
            <dl className="mt-5 grid gap-4 text-sm md:grid-cols-2">
              <div>
                <dt className="text-slate-500">套装编号</dt>
                <dd className="font-medium text-slate-950">{data.set.setNum}</dd>
              </div>
              <div>
                <dt className="text-slate-500">官方零件数</dt>
                <dd className="font-medium text-slate-950">
                  {formatNumber(data.set.numParts)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">备用零件记录</dt>
                <dd className="font-medium text-slate-950">{formatNumber(spareRows)}</dd>
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

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {data.inventoryFiles.map((file) => (
                <Link
                  key={file.name}
                  href={file.href}
                  target="_blank"
                  className="inline-flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  <span className="inline-flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {file.name}
                  </span>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
              <Link
                href={detailHref(setNum, { section: "parts" })}
                scroll={false}
                className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                查看零件清单
              </Link>
              <Link
                href={detailHref(setNum, { section: "mocs" })}
                scroll={false}
                className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
              >
                查看 Alternate MOC
              </Link>
              {data.set.rebrickableUrl ? (
                <Link
                  href={data.set.rebrickableUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  Rebrickable
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </Card>
          </div>

          <Card>
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              <CardTitle>下载 / 更新数据</CardTitle>
            </div>
            <CardDescription>
              为此套装创建下载任务，拉取最新套装信息、零件清单与 Alternate MOC 摘要（与首页原入口行为一致）。
            </CardDescription>
            <SetDownloadForm presetSetNum={data.set.setNum} lockSetNum />
          </Card>
        </section>
      ) : null}

      {activeSection === "parts" ? (
        <Card>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <CardTitle>零件清单</CardTitle>
              <CardDescription>
                共 {formatNumber(data.inventory.length)} 条记录，每页 {formatNumber(partPageSize)} 条。
              </CardDescription>
            </div>
            <Badge>
              第 {formatNumber(partPage)} / {formatNumber(partTotalPages)} 页
            </Badge>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-3 pr-4 font-medium">零件</th>
                  <th className="py-3 pr-4 font-medium">颜色</th>
                  <th className="py-3 pr-4 font-medium">数量</th>
                  <th className="py-3 pr-4 font-medium">分类</th>
                  <th className="py-3 pr-4 font-medium">Element ID</th>
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
                    <td className="py-3 pr-4 text-slate-500">{item.elementId ?? "-"}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {item.isSpare ? "是" : "否"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={partPage}
            totalItems={data.inventory.length}
            pageSize={partPageSize}
            hrefForPage={(page) => detailHref(setNum, { section: "parts", partPage: page })}
          />
        </Card>
      ) : null}

      {activeSection === "mocs" ? (
        <Card>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <CardTitle>Alternate MOC 摘要</CardTitle>
              <CardDescription>
                共 {formatNumber(data.alternates.length)} 条摘要，每页 {formatNumber(mocPageSize)} 条。
              </CardDescription>
            </div>
            <Badge>
              第 {formatNumber(mocPage)} / {formatNumber(mocTotalPages)} 页
            </Badge>
          </div>
          {data.alternates.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">
              当前套装还没有缓存 Alternate MOC 摘要。
            </p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pagedMocs.map((moc) => (
                <article key={moc.mocId} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex gap-4">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                      {moc.imageUrl ? (
                        <div className="relative h-20 w-20">
                          <Image
                            src={moc.imageUrl}
                            alt={moc.name}
                            fill
                            sizes="80px"
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <Box className="h-8 w-8 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">{mocCode(moc)}</p>
                      <h3 className="mt-1 line-clamp-2 font-semibold text-slate-950">
                        {moc.name}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {moc.designerName ?? "未知作者"} · {formatNumber(moc.numParts)} parts
                      </p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Link
                          href={`/mocs/${moc.mocId}`}
                          className="inline-flex items-center gap-2 text-sm font-medium text-slate-950 underline-offset-2 hover:underline"
                        >
                          本地 MOC 详情
                        </Link>
                        {moc.rebrickableUrl ? (
                          <Link
                            href={moc.rebrickableUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-950"
                          >
                            Rebrickable
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <Pagination
            currentPage={mocPage}
            totalItems={data.alternates.length}
            pageSize={mocPageSize}
            hrefForPage={(page) => detailHref(setNum, { section: "mocs", mocPage: page })}
          />
        </Card>
      ) : null}

      {activeSection === "raw" ? (
        <Card>
          <CardTitle>原始 JSON</CardTitle>
          <CardDescription>保存到 SQLite 的套装 API 响应，便于核对下载内容。</CardDescription>
          <pre className="mt-5 max-h-[640px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
            {setRawJson}
          </pre>
        </Card>
      ) : null}
    </main>
  );
}
