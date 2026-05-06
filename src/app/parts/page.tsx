import Image from "next/image";
import Link from "next/link";
import { Box, Palette } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getPartExplorerData } from "@/lib/rebrickable/downloads";

export const dynamic = "force-dynamic";

type PartsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    color?: string | string[];
    page?: string | string[];
  }>;
};

const pageSize = 48;

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberSearchValue(value: string | string[] | undefined) {
  const parsed = Number(firstSearchValue(value));

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
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

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const query = await searchParams;
  const data = getPartExplorerData({
    query: firstSearchValue(query.q),
    categoryId: numberSearchValue(query.category),
    colorId: numberSearchValue(query.color),
    page: numberSearchValue(query.page),
    pageSize,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 rounded-3xl bg-slate-950 p-8 text-white">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <Box className="h-4 w-4" />
          <span>本地零件目录</span>
        </div>
        <div>
          <p className="text-sm font-medium text-slate-300">Rebrickable Catalog</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">全部零件查询</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            查询本地缓存的 LEGO 全量零件，按零件编号、名称、分类和可用配色筛选。
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardDescription>匹配零件</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(data.pagination.total)}</p>
        </Card>
        <Card>
          <CardDescription>分类</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(data.categories.length)}</p>
        </Card>
        <Card>
          <CardDescription>可筛选颜色</CardDescription>
          <p className="mt-3 text-4xl font-bold">{formatNumber(data.colors.length)}</p>
        </Card>
      </section>

      <Card>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          <CardTitle>筛选零件</CardTitle>
        </div>
        <CardDescription>
          关键词会匹配零件编号、零件名称和分类；颜色筛选依赖已下载的全量零件配色索引。
        </CardDescription>
        <form action="/parts" className="mt-5 grid gap-3 lg:grid-cols-[1.3fr_1fr_1fr_auto_auto]">
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
            如果本地目录为空，请先到 MOC 过滤页面下载全量零件配色索引。
          </CardDescription>
          <Link
            href="/moc-import"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            去下载索引
          </Link>
        </Card>
      ) : (
        <section className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-sm text-slate-500">
              共 {formatNumber(data.pagination.total)} 个零件，每页{" "}
              {formatNumber(data.pagination.pageSize)} 个。
            </p>
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              hrefForPage={(page) => partsHref(data.filters, page)}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {data.parts.map((part) => {
              const selectedColor = part.colors.find(
                (color) => color.colorId === data.filters.colorId,
              );
              const imageUrl = selectedColor?.imageUrl ?? part.imageUrl;
              const previewColors = part.colors.slice(0, 8);

              return (
                <Card key={part.partNum} className="flex flex-col gap-5">
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
                      <CardTitle className="line-clamp-2">{part.name}</CardTitle>
                      <p className="mt-2 text-sm font-medium text-slate-500">{part.partNum}</p>
                      {part.categoryName ? <Badge className="mt-3">{part.categoryName}</Badge> : null}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">可用配色</span>
                      <span className="font-medium text-slate-950">
                        {formatNumber(part.colors.length)}
                      </span>
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
                  </div>
                </Card>
              );
            })}
          </div>

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            hrefForPage={(page) => partsHref(data.filters, page)}
          />
        </section>
      )}
    </main>
  );
}
