import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Box, Search } from "lucide-react";

import {
  getPartCatalogSummary,
  getPartDetailWithElements,
  getPartExplorerData,
  lookupPartByElementId,
} from "@/lib/rebrickable/downloads";
import { isPrintedVariantPartNum } from "@/lib/rebrickable/printed-part";

import { PartsBrowseFiltersForm } from "./parts-browse-filters-form";

export const dynamic = "force-dynamic";

type PartsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    color?: string | string[];
    page?: string | string[];
    part?: string | string[];
    element?: string | string[];
    /** @deprecated 与 q 合并处理，仅兼容旧链接 */
    lookup?: string | string[];
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
    <nav className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="text-slate-500">
        {formatNumber(page)} / {formatNumber(totalPages)} 页
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Link
          href={hrefForPage(Math.max(page - 1, 1))}
          scroll={false}
          aria-disabled={page === 1}
          className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:text-slate-950 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          上一页
        </Link>
        {pages.map((item, index) => {
          const previous = pages[index - 1];

          return (
            <span key={item} className="flex items-center gap-1">
              {previous && item - previous > 1 ? (
                <span className="px-0.5 text-slate-400">…</span>
              ) : null}
              <Link
                href={hrefForPage(item)}
                scroll={false}
                aria-current={item === page ? "page" : undefined}
                className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:text-slate-950 aria-current:border-slate-950 aria-current:bg-slate-950 aria-current:text-white"
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
          className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:text-slate-950 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          下一页
        </Link>
      </div>
    </nav>
  );
}

function browseFiltersFormKey(query: {
  q?: string | string[];
  category?: string | string[];
  color?: string | string[];
  page?: string | string[];
}) {
  return [
    firstSearchValue(query.q) ?? "",
    firstSearchValue(query.category) ?? "",
    firstSearchValue(query.color) ?? "",
    firstSearchValue(query.page) ?? "",
  ].join("|");
}

type ExplorerPart = ReturnType<typeof getPartExplorerData>["parts"][number];

function PartBrowseRow({
  part,
  selectedColorId,
}: {
  part: ExplorerPart;
  selectedColorId: number | undefined;
}) {
  const selectedColor = part.colors.find((color) => color.colorId === selectedColorId);
  const imageUrl = selectedColor?.imageUrl ?? part.imageUrl;
  const printed = isPrintedVariantPartNum(part.partNum);
  const href = `/parts/${encodeURIComponent(part.partNum)}`;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-slate-100 py-2.5 pr-1 text-left transition-colors last:border-0 hover:bg-slate-50/80"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50">
        {imageUrl ? (
          <div className="relative h-8 w-8">
            <Image
              src={imageUrl}
              alt=""
              fill
              loading="lazy"
              decoding="async"
              sizes="32px"
              className="object-contain"
            />
          </div>
        ) : (
          <Box className="h-4 w-4 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{part.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-slate-500">
          <span>{part.partNum}</span>
          {part.categoryName ? (
            <span className="font-sans text-slate-400">· {part.categoryName}</span>
          ) : null}
          {printed ? <span className="text-amber-700">印刷</span> : null}
        </p>
      </div>
      <div className="shrink-0 text-right text-xs text-slate-400">
        {formatNumber(part.colors.length)} 色
      </div>
    </Link>
  );
}

export default async function PartsPage({ searchParams }: PartsPageProps) {
  const query = await searchParams;
  const summary = getPartCatalogSummary();

  const elementParam = firstSearchValue(query.element)?.trim() ?? "";
  const partParam = firstSearchValue(query.part)?.trim() ?? "";
  const qTrimmed = (
    firstSearchValue(query.q) ||
    firstSearchValue(query.lookup) ||
    ""
  ).trim();

  const categoryId = numberSearchValue(query.category);
  const colorId = numberSearchValue(query.color);
  const pageNum = numberSearchValue(query.page);
  const browseOnlyContext =
    categoryId !== undefined ||
    colorId !== undefined ||
    (pageNum !== undefined && pageNum > 1);

  if (elementParam) {
    const hit = lookupPartByElementId(elementParam);
    if (hit) {
      redirect(
        `/parts/${encodeURIComponent(hit.part.partNum)}?element=${encodeURIComponent(elementParam)}`,
      );
    }
  } else if (partParam) {
    redirect(`/parts/${encodeURIComponent(partParam)}`);
  }

  let exactPartOrElementMiss = false;
  if (!elementParam && !partParam && qTrimmed && !browseOnlyContext) {
    const byElement = lookupPartByElementId(qTrimmed);
    if (byElement) {
      redirect(
        `/parts/${encodeURIComponent(byElement.part.partNum)}?element=${encodeURIComponent(qTrimmed)}`,
      );
    }
    const byPart = getPartDetailWithElements(qTrimmed);
    if (byPart) {
      redirect(`/parts/${encodeURIComponent(byPart.part.partNum)}`);
    }
    exactPartOrElementMiss = true;
  }

  const data = getPartExplorerData({
    query: qTrimmed || undefined,
    categoryId,
    colorId,
    page: pageNum,
    pageSize,
  });

  const browsePlainParts = data.parts.filter((p) => !isPrintedVariantPartNum(p.partNum));
  const browsePrintedParts = data.parts.filter((p) => isPrintedVariantPartNum(p.partNum));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <h1 className="text-lg font-semibold tracking-tight text-slate-950">零件目录</h1>
        <p className="text-xs text-slate-500">
          本地 {formatNumber(summary.partCount)} 零件 · {formatNumber(summary.partCategoryCount)}{" "}
          分类 · {formatNumber(summary.colorCount)} 颜色 · 目录{" "}
          {formatDate(summary.latestCatalogJob?.updatedAt ?? null)}
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          筛选
        </div>
        <PartsBrowseFiltersForm
          formKey={browseFiltersFormKey(query)}
          query={data.filters.query}
          categoryId={data.filters.categoryId}
          colorId={data.filters.colorId}
          categories={data.categories}
          colors={data.colors}
        />
      </section>

      {elementParam ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          未找到 Element「{elementParam}」。请确认已下载目录并运行{" "}
          <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">pnpm sync:assets</code>。
        </p>
      ) : null}
      {!elementParam && exactPartOrElementMiss && data.parts.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          未找到 Part 或 Element「{qTrimmed}」，列表也无匹配。请核对编号，或确认已下载目录并运行{" "}
          <code className="rounded bg-amber-100/80 px-1 font-mono text-xs">pnpm sync:assets</code>。
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-xs text-slate-500">
            共 {formatNumber(data.pagination.total)} 条 · 每页 {formatNumber(data.pagination.pageSize)}
          </p>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            hrefForPage={(page) => partsHref(data.filters, page)}
          />
        </div>

        {data.parts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
            无匹配零件
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-2 sm:px-3">
            {browsePlainParts.length > 0 ? (
              <div>
                <p className="border-b border-slate-100 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  普通零件 · {formatNumber(browsePlainParts.length)}
                </p>
                {browsePlainParts.map((part) => (
                  <PartBrowseRow
                    key={part.partNum}
                    part={part}
                    selectedColorId={data.filters.colorId}
                  />
                ))}
              </div>
            ) : null}
            {browsePrintedParts.length > 0 ? (
              <div className={browsePlainParts.length > 0 ? "mt-1" : ""}>
                <p className="border-b border-slate-100 py-2 text-[11px] font-medium uppercase tracking-wide text-amber-700/80">
                  印刷件 · {formatNumber(browsePrintedParts.length)}
                </p>
                {browsePrintedParts.map((part) => (
                  <PartBrowseRow
                    key={part.partNum}
                    part={part}
                    selectedColorId={data.filters.colorId}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}

        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          hrefForPage={(page) => partsHref(data.filters, page)}
        />
      </section>
    </main>
  );
}
