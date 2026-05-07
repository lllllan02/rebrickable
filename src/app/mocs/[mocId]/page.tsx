import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, ExternalLink, FileStack, Layers, Upload } from "lucide-react";

import { MocAppendAttachmentsForm } from "@/app/moc-append-attachments-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { mocAttachmentTypeLabel } from "@/lib/moc-attachment-kind";
import { getMocDetailData } from "@/lib/rebrickable/downloads";

export const dynamic = "force-dynamic";

type MocDetailPageProps = {
  params: Promise<{ mocId: string }>;
  searchParams: Promise<{
    section?: string | string[];
    partPage?: string | string[];
  }>;
};

type DetailSection = "overview" | "parts" | "files" | "raw";

const partPageSize = 40;

const detailSections: Array<{
  id: DetailSection;
  title: string;
  description: string;
}> = [
  {
    id: "overview",
    title: "概要",
    description: "元数据与导入说明",
  },
  {
    id: "parts",
    title: "零件清单",
    description: "本地已缓存的 MOC 零件",
  },
  {
    id: "files",
    title: "文档与附件",
    description: "说明书、Stud.io、压缩包等",
  },
  {
    id: "raw",
    title: "原始 JSON",
    description: "附加元数据（若有）",
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

function formatBytes(n: number) {
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }

  if (n < 1024) {
    return `${n} B`;
  }

  if (n < 1048576) {
    return `${(n / 1024).toFixed(1)} KB`;
  }

  return `${(n / 1048576).toFixed(1)} MB`;
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

  if (params.section === "parts" && params.partPage && params.partPage > 1) {
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
                本地 MOC 元数据与零件清单（若有）。清单通过「MOC 导入」上传；使用相同 MOC ID
                再次导入可覆盖零件表。
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
              <Upload className="h-5 w-5" />
              <CardTitle>更新零件清单</CardTitle>
            </div>
            <CardDescription>
              在「MOC 导入」页上传新的 CSV / JSON，填写与本页相同的 MOC ID（{moc.mocId}
              ）即可覆盖本地 moc_parts。
            </CardDescription>
            <div className="mt-4">
              <Link
                href="/moc-import"
                className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                前往 MOC 导入
              </Link>
            </div>
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
              当前 MOC 没有本地零件清单。请使用「MOC 导入」上传从网页导出的 CSV 或 JSON。
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

      {activeSection === "files" ? (
        <div className="flex flex-col gap-6">
          <Card>
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <FileStack className="h-5 w-5" />
                  <CardTitle>已保存的附件</CardTitle>
                </div>
                <CardDescription>
                  文件位于本地 <code className="rounded bg-slate-100 px-1">public/lego-assets/mocs/</code>
                  ，可通过下方链接下载。
                </CardDescription>
              </div>
              <Badge>{formatNumber(data.attachments.length)} 个文件</Badge>
            </div>
            {data.attachments.length === 0 ? (
              <p className="mt-6 rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">
                尚无附件。可在下方表单继续上传说明书 PDF、Stud.io（.io）、LDraw、压缩包等。
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-slate-100">
                {data.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-950">{att.originalFileName}</p>
                      <p className="text-xs text-slate-500">
                        {mocAttachmentTypeLabel(att.attachmentType)} · {formatBytes(att.fileSize)} ·{" "}
                        {formatDate(att.createdAt)}
                      </p>
                    </div>
                    <a
                      href={att.publicPath}
                      download={att.originalFileName}
                      className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
                    >
                      下载
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>继续添加附件</CardTitle>
            <CardDescription>与「MOC 导入」页相同规则；不会覆盖已有零件清单。</CardDescription>
            <div className="mt-5">
              <MocAppendAttachmentsForm mocId={mocId} />
            </div>
          </Card>
        </div>
      ) : null}

      {activeSection === "raw" ? (
        <Card>
          <CardTitle>原始 JSON</CardTitle>
          <CardDescription>保存到 SQLite 的 raw_json 字段（若有），便于核对来源数据。</CardDescription>
          <pre className="mt-5 max-h-[640px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
            {mocRawJson}
          </pre>
        </Card>
      ) : null}
    </main>
  );
}
