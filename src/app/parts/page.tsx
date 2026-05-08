import Image from "next/image";
import Link from "next/link";
import { Box, ExternalLink, Palette, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getPartCatalogSummary,
  getPartDetailWithElements,
  getPartExplorerData,
  lookupPartByElementId,
  type PartColorElementRow,
} from "@/lib/rebrickable/downloads";
import { isPrintedVariantPartNum } from "@/lib/rebrickable/printed-part";
import { CatalogDownloadForm } from "./catalog-download-form";

export const dynamic = "force-dynamic";

type PartsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    color?: string | string[];
    page?: string | string[];
    part?: string | string[];
    element?: string | string[];
  }>;
};

const pageSize = 48;

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberSearchValue(value: string | string[] | undefined) {
  const raw = firstSearchValue(value);
  if (raw === undefined || raw === "") {
    return undefined;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

function formatDate(value: Date | null) {
  if (!value) {
    return "未下载";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function partsHref(
  params: {
    query: string;
    categoryId?: number;
    colorId?: number;
  },
  page: number,
) {
  const search = new URLSearchParams();

  if (params.query) {
    search.set("q", params.query);
  }

  if (params.categoryId !== undefined) {
    search.set("category", String(params.categoryId));
  }

  if (params.colorId !== undefined) {
    search.set("color", String(params.colorId));
  }

  if (page > 1) {
    search.set("page", String(page));
  }

  const query = search.toString();

  return `/parts${query ? `?${query}` : ""}`;
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

function PartHeaderBlock({
  name,
  partNum,
  categoryName,
  imageUrl,
  printed,
}: {
  name: string;
  partNum: string;
  categoryName: string | null;
  imageUrl: string | null;
  printed?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-slate-50">
        {imageUrl ? (
          <div className="relative h-24 w-24">
            <Image src={imageUrl} alt={name} fill sizes="96px" className="object-contain" />
          </div>
        ) : (
          <Box className="h-10 w-10 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <CardTitle className="text-xl leading-snug">{name}</CardTitle>
        <p className="mt-2 font-mono text-sm font-medium text-slate-600">{partNum}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {printed ? (
            <Badge tone="pending" className="border border-amber-200/60">
              印刷件
            </Badge>
          ) : (
            <Badge tone="default">普通零件</Badge>
          )}
          {categoryName ? <Badge tone="default">{categoryName}</Badge> : null}
        </div>
      </div>
    </div>
  );
}

type ExplorerPart = ReturnType<typeof getPartExplorerData>["parts"][number];

function BrowsePartCard({
  part,
  selectedColorId,
}: {
  part: ExplorerPart;
  selectedColorId: number | undefined;
}) {
  const selectedColor = part.colors.find((color) => color.colorId === selectedColorId);
  const imageUrl = selectedColor?.imageUrl ?? part.imageUrl;
  const previewColors = part.colors.slice(0, 8);
  const printed = isPrintedVariantPartNum(part.partNum);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-slate-50">
          {imageUrl ? (
            <div className="relative h-20 w-20">
              <Image
                src={imageUrl}
                alt={part.name}
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
          <div className="flex flex-wrap items-start gap-2">
            <CardTitle className="line-clamp-2 flex-1">{part.name}</CardTitle>
            {printed ? (
              <Badge tone="pending" className="shrink-0 text-[10px]">
                印刷
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 font-mono text-sm font-medium text-slate-500">{part.partNum}</p>
          {part.categoryName ? <Badge className="mt-3">{part.categoryName}</Badge> : null}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">可用配色</span>
          <span className="font-medium text-slate-950">{formatNumber(part.colors.length)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {previewColors.length === 0 ? (
            <span className="text-sm text-slate-400">暂无配色索引</span>
          ) : (
            previewColors.map((color) => (
              <span
                key={`${part.partNum}-${color.colorId}`}
                title={color.colorName}
                className="inline-flex h-7 items-center gap-2 rounded-full border border-slate-200 px-2 text-xs text-slate-600"
              >
                {color.colorRgb ? (
                  <span
                    className="h-3 w-3 rounded-full border border-slate-200"
                    style={{ backgroundColor: `#${color.colorRgb}` }}
                  />
                ) : null}
                {color.colorName}
              </span>
            ))
          )}
        </div>
        {selectedColor ? (
          <p className="mt-3 text-xs text-slate-500">
            当前配色出现于 {formatNumber(selectedColor.numSets)} 个套装
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Link
          href={`/parts?part=${encodeURIComponent(part.partNum)}`}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          查看 Element 列表
        </Link>
        {part.rebrickableUrl ? (
          <Link
            href={part.rebrickableUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
          >
            Rebrickable
            <ExternalLink className="h-4 w-4" />
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function ElementIdLink({ id }: { id: string }) {
  return (
    <Link
      href={`/parts?element=${encodeURIComponent(id)}`}
      className="font-mono text-xs text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-950"
    >
      {id}
    </Link>
  );
}

function ColorElementsTable({
  rows,
  highlightElementId,
}: {
  rows: PartColorElementRow[];
  highlightElementId?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        本地目录中暂无该零件的配色与 Element 数据，请先完成全量零件目录下载并同步 assets。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">颜色</th>
            <th className="px-4 py-3 font-medium">套装中出现次数</th>
            <th className="px-4 py-3 font-medium">Element ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.colorId}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  {row.colorRgb ? (
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border border-slate-200"
                      style={{ backgroundColor: `#${row.colorRgb}` }}
                    />
                  ) : null}
                  <span>{row.colorName}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">{formatNumber(row.numSets)}</td>
              <td className="px-4 py-3">
                {row.elementIds.length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <ul className="flex max-w-xl flex-col gap-1">
                    {row.elementIds.map((id) => (
                      <li key={`${row.colorId}-${id}`}>
                        <ElementIdLink id={id} />
                        {highlightElementId === id ? (
                          <Badge className="ml-2 align-middle text-[10px]">当前查询</Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const query = await searchParams;
  const summary = getPartCatalogSummary();

  const elementParam = firstSearchValue(query.element)?.trim() ?? "";
  const partParam = firstSearchValue(query.part)?.trim() ?? "";

  const elementLookup = elementParam ? lookupPartByElementId(elementParam) : null;
  const partDetail =
    !elementParam && partParam ? getPartDetailWithElements(partParam) : null;

  const browseMode = !elementParam && !partParam;

  const data = browseMode
    ? getPartExplorerData({
        query: firstSearchValue(query.q),
        categoryId: numberSearchValue(query.category),
        colorId: numberSearchValue(query.color),
        page: numberSearchValue(query.page),
        pageSize,
      })
    : null;

  const browsePlainParts =
    data?.parts.filter((p) => !isPrintedVariantPartNum(p.partNum)) ?? [];
  const browsePrintedParts =
    data?.parts.filter((p) => isPrintedVariantPartNum(p.partNum)) ?? [];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-8 text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Box className="h-4 w-4" />
          <span>本地零件目录</span>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-300">Rebrickable Catalog</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">零件与 Element 查询</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            支持按关键词浏览全量零件；也可按零件编号（Part ID）查看所有 Element，或按 Element ID
            反查对应零件与配色。
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardDescription>本地零件</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(summary.partCount)}</p>
        </Card>
        <Card>
          <CardDescription>零件分类</CardDescription>
          <p className="mt-3 text-4xl font-bold">
            {formatNumber(summary.partCategoryCount)}
          </p>
        </Card>
        <Card>
          <CardDescription>颜色</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(summary.colorCount)}</p>
        </Card>
        <Card>
          <CardDescription>零件配色</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(summary.partColorCount)}</p>
        </Card>
      </section>

      <Card>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          <CardTitle>全量零件目录下载</CardTitle>
        </div>
        <CardDescription>
          下载 Rebrickable 零件、分类、颜色和所有出现过的配色，供零件查询和后续套装下载复用。
        </CardDescription>
        <p className="mt-4 text-sm text-slate-500">
          最近目录任务：{formatDate(summary.latestCatalogJob?.updatedAt ?? null)}
        </p>
        <CatalogDownloadForm />
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          <CardTitle>精确查询</CardTitle>
        </div>
        <CardDescription>
          填写零件编号或 Element ID 其一即可。若同时填写，优先按 Element ID 查询。
        </CardDescription>
        <form
          action="/parts"
          method="get"
          className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]"
        >
          <div>
            <label htmlFor="part-exact" className="mb-1.5 block text-xs font-medium text-slate-500">
              零件编号（Part ID）
            </label>
            <Input
              id="part-exact"
              name="part"
              defaultValue={partParam}
              placeholder="例如 3001、87994"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <div>
            <label
              htmlFor="element-exact"
              className="mb-1.5 block text-xs font-medium text-slate-500"
            >
              Element ID
            </label>
            <Input
              id="element-exact"
              name="element"
              defaultValue={elementParam}
              placeholder="例如 6132744"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            className="self-end inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700 md:self-end"
          >
            查询
          </button>
          <Link
            href="/parts"
            className="self-end inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950 md:self-end"
          >
            清除
          </Link>
        </form>
      </Card>

      {elementParam ? (
        <Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Element ID 查询结果</CardTitle>
              <CardDescription className="font-mono">{elementParam}</CardDescription>
            </div>
            <Link
              href="/parts"
              className="shrink-0 text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline"
            >
              返回浏览
            </Link>
          </div>
          {elementLookup ? (
            <div className="mt-6 flex flex-col gap-6">
              <PartHeaderBlock
                name={elementLookup.part.name}
                partNum={elementLookup.part.partNum}
                categoryName={elementLookup.part.categoryName}
                imageUrl={
                  elementLookup.colorRow.imageUrl ?? elementLookup.part.imageUrl ?? null
                }
                printed={isPrintedVariantPartNum(elementLookup.part.partNum)}
              />
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">命中配色与全部 Element</p>
                <ColorElementsTable
                  rows={[elementLookup.colorRow]}
                  highlightElementId={elementLookup.matchedElementId}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/parts?part=${encodeURIComponent(elementLookup.part.partNum)}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  查看该零件全部 Element
                </Link>
                {elementLookup.part.rebrickableUrl ? (
                  <Link
                    href={elementLookup.part.rebrickableUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                  >
                    Rebrickable
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              未在本地目录中找到该 Element ID。请确认已下载全量目录并已运行{" "}
              <code className="rounded bg-amber-100 px-1">pnpm sync:assets</code>{" "}
              将 elements 数据合并进数据库。
            </p>
          )}
        </Card>
      ) : partParam ? (
        <Card>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>零件与全部 Element</CardTitle>
              <CardDescription className="font-mono">{partParam}</CardDescription>
            </div>
            <Link
              href="/parts"
              className="shrink-0 text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline"
            >
              返回浏览
            </Link>
          </div>
          {partDetail ? (
            <div className="mt-6 flex flex-col gap-6">
              <PartHeaderBlock
                name={partDetail.part.name}
                partNum={partDetail.part.partNum}
                categoryName={partDetail.part.categoryName}
                imageUrl={partDetail.part.imageUrl}
                printed={isPrintedVariantPartNum(partDetail.part.partNum)}
              />
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span className="font-medium text-slate-800">去重后 Element 总数：</span>
                {formatNumber(partDetail.allElementIds.length)}
              </div>
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">按配色列出 Element</p>
                <ColorElementsTable rows={partDetail.colorRows} />
              </div>
              {partDetail.part.rebrickableUrl ? (
                <Link
                  href={partDetail.part.rebrickableUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 w-fit items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
                >
                  Rebrickable
                  <ExternalLink className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              未找到零件编号「{partParam}」。请检查拼写，或先在浏览模式中确认本地是否存在该零件。
            </p>
          )}
        </Card>
      ) : null}

      {browseMode && data ? (
        <>
          <Card>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              <CardTitle>浏览与筛选</CardTitle>
            </div>
            <CardDescription>
              关键词会匹配零件编号、零件名称和分类；颜色筛选依赖已下载的全量零件目录。
              列表按「普通零件 / 印刷件」分两区：印刷件指编号中含 Rebrickable 的{" "}
              <code className="rounded bg-slate-100 px-1 font-mono text-xs">pr</code>{" "}
              变体后缀的零件（如 <span className="font-mono">3001pr0001</span>）。
            </CardDescription>
            <form
              action="/parts"
              className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_auto_auto]"
            >
              <Input
                name="q"
                defaultValue={data.filters.query}
                placeholder="搜索零件编号、名称或分类"
                className="w-full"
              />
              <select
                name="category"
                defaultValue={data.filters.categoryId ?? ""}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-slate-400"
              >
                <option value="">全部分类</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name} ({formatNumber(category.count)})
                  </option>
                ))}
              </select>
              <select
                name="color"
                defaultValue={data.filters.colorId ?? ""}
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-slate-400"
              >
                <option value="">全部颜色</option>
                {data.colors.map((color) => (
                  <option key={color.id} value={color.id}>
                    {color.name} ({formatNumber(color.count)})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
              >
                查询
              </button>
              <Link
                href="/parts"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
              >
                重置
              </Link>
            </form>
          </Card>

          {data.parts.length === 0 ? (
            <Card>
              <div className="flex items-center gap-2">
                <Box className="h-5 w-5" />
                <CardTitle>没有匹配零件</CardTitle>
              </div>
              <CardDescription>
                如果本地目录为空，请先在本页下载全量零件目录。
              </CardDescription>
            </Card>
          ) : (
            <section className="flex flex-col gap-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-sm text-slate-500">
                  共 {formatNumber(data.pagination.total)} 个零件，每页{" "}
                  {formatNumber(data.pagination.pageSize)} 个。本页：普通{" "}
                  {formatNumber(browsePlainParts.length)} · 印刷{" "}
                  {formatNumber(browsePrintedParts.length)}
                </p>
                <Pagination
                  page={data.pagination.page}
                  totalPages={data.pagination.totalPages}
                  hrefForPage={(page) => partsHref(data.filters, page)}
                />
              </div>

              {browsePlainParts.length > 0 ? (
                <div className="flex flex-col gap-4">
                  <div className="border-b border-slate-200 pb-2">
                    <h2 className="text-lg font-semibold text-slate-950">普通零件</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      本页 {formatNumber(browsePlainParts.length)} 条（未匹配{" "}
                      <code className="rounded bg-slate-100 px-0.5 font-mono">pr</code> 印刷变体编号
                      规则）
                    </p>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {browsePlainParts.map((part) => (
                      <BrowsePartCard
                        key={part.partNum}
                        part={part}
                        selectedColorId={data.filters.colorId}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {browsePrintedParts.length > 0 ? (
                <div className="flex flex-col gap-4">
                  <div className="border-b border-amber-200/80 pb-2">
                    <h2 className="text-lg font-semibold text-slate-950">印刷件</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      本页 {formatNumber(browsePrintedParts.length)} 条（编号含 Rebrickable 印刷变体
                      标记，如 <span className="font-mono">…pr0001</span>）
                    </p>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {browsePrintedParts.map((part) => (
                      <BrowsePartCard
                        key={part.partNum}
                        part={part}
                        selectedColorId={data.filters.colorId}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <Pagination
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                hrefForPage={(page) => partsHref(data.filters, page)}
              />
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
