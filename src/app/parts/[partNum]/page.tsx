import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  getPartDetailWithElements,
  lookupPartByElementId,
} from "@/lib/rebrickable/downloads";
import { isPrintedVariantPartNum } from "@/lib/rebrickable/printed-part";

import {
  ColorElementsTable,
  PartHeaderBlock,
  RebrickableOutLink,
} from "../part-detail-sections";

export const dynamic = "force-dynamic";

type PartDetailPageProps = {
  params: Promise<{ partNum: string }>;
  searchParams: Promise<{ element?: string | string[] }>;
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

export default async function PartDetailPage({ params, searchParams }: PartDetailPageProps) {
  const { partNum: rawPartNum } = await params;
  const query = await searchParams;
  const partNum = decodeURIComponent(rawPartNum);
  const elementHighlight = firstSearchValue(query.element)?.trim() ?? "";

  const detail = getPartDetailWithElements(partNum);

  if (!detail) {
    notFound();
  }

  const elementLookup =
    elementHighlight ? lookupPartByElementId(elementHighlight) : null;
  const elementWrongPart =
    elementLookup !== null && elementLookup.part.partNum !== detail.part.partNum;
  const elementNotInCatalog = Boolean(elementHighlight) && elementLookup === null;
  const elementHit = elementLookup && !elementWrongPart ? elementLookup : null;

  const printed = isPrintedVariantPartNum(detail.part.partNum);
  const headerImage =
    elementHit !== null
      ? (elementHit.colorRow.imageUrl ?? detail.part.imageUrl ?? null)
      : detail.part.imageUrl;

  const tableRows = elementHit !== null ? [elementHit.colorRow] : detail.colorRows;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/parts"
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <PartHeaderBlock
          name={detail.part.name}
          partNum={detail.part.partNum}
          categoryName={detail.part.categoryName}
          imageUrl={headerImage}
          printed={printed}
        />

        {elementNotInCatalog ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            未在本地目录中找到 Element「{elementHighlight}」。下方列出本零件全部配色与 Element。
          </p>
        ) : null}
        {elementWrongPart && elementLookup ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Element「{elementHighlight}」属于零件{" "}
            <Link
              href={`/parts/${encodeURIComponent(elementLookup.part.partNum)}?element=${encodeURIComponent(elementHighlight)}`}
              className="font-mono font-medium underline-offset-2 hover:underline"
            >
              {elementLookup.part.partNum}
            </Link>
            。下方为本页零件的全部配色与 Element。
          </p>
        ) : null}

        <p className="mt-4 text-sm text-slate-600">
          去重 Element 数：<span className="font-medium">{formatNumber(detail.allElementIds.length)}</span>
        </p>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            按配色
          </p>
          <ColorElementsTable
            partNum={detail.part.partNum}
            rows={tableRows}
            highlightElementId={elementHit?.matchedElementId}
          />
        </div>

        {elementHit ? (
          <p className="mt-3 text-xs text-slate-500">
            当前仅显示命中 Element 所在配色行。
            <Link
              href={`/parts/${encodeURIComponent(detail.part.partNum)}`}
              className="ml-1 font-medium text-slate-700 underline-offset-2 hover:underline"
            >
              查看全部配色
            </Link>
          </p>
        ) : null}

        {detail.part.rebrickableUrl ? (
          <div className="mt-5">
            <RebrickableOutLink href={detail.part.rebrickableUrl} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
