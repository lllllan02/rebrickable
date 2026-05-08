import Image from "next/image";
import Link from "next/link";
import { Box, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CardTitle } from "@/components/ui/card";
import type { PartColorElementRow } from "@/lib/rebrickable/downloads";

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("zh-CN").format(value ?? 0);
}

export function PartHeaderBlock({
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-50">
        {imageUrl ? (
          <div className="relative h-16 w-16">
            <Image
              src={imageUrl}
              alt={name}
              fill
              loading="lazy"
              decoding="async"
              sizes="64px"
              className="object-contain"
            />
          </div>
        ) : (
          <Box className="h-8 w-8 text-slate-300" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <CardTitle className="text-lg leading-snug">{name}</CardTitle>
        <p className="mt-1 font-mono text-sm text-slate-600">{partNum}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {printed ? (
            <Badge tone="pending" className="border border-amber-200/60 text-[10px]">
              印刷件
            </Badge>
          ) : (
            <Badge tone="default" className="text-[10px]">
              普通零件
            </Badge>
          )}
          {categoryName ? (
            <Badge tone="default" className="text-[10px]">
              {categoryName}
            </Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ElementIdLink({ partNum, id }: { partNum: string; id: string }) {
  return (
    <Link
      href={`/parts/${encodeURIComponent(partNum)}?element=${encodeURIComponent(id)}`}
      className="font-mono text-xs text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-950"
    >
      {id}
    </Link>
  );
}

export function ColorElementsTable({
  partNum,
  rows,
  highlightElementId,
}: {
  partNum: string;
  rows: PartColorElementRow[];
  highlightElementId?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
        本地目录中暂无该零件的配色与 Element 数据，请先完成全量零件目录下载并同步 assets。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 font-medium">颜色</th>
            <th className="px-3 py-2 font-medium">套装中出现次数</th>
            <th className="px-3 py-2 font-medium">Element ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.colorId}>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {row.colorRgb ? (
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-200"
                      style={{ backgroundColor: `#${row.colorRgb}` }}
                    />
                  ) : null}
                  <span>{row.colorName}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-slate-600">{formatNumber(row.numSets)}</td>
              <td className="px-3 py-2">
                {row.elementIds.length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <ul className="flex max-w-xl flex-col gap-0.5">
                    {row.elementIds.map((id) => (
                      <li key={`${row.colorId}-${id}`}>
                        <ElementIdLink partNum={partNum} id={id} />
                        {highlightElementId === id ? (
                          <Badge className="ml-1.5 align-middle text-[10px]">当前</Badge>
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

export function RebrickableOutLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-9 w-fit items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 transition-colors hover:text-slate-950"
    >
      Rebrickable
      <ExternalLink className="h-3.5 w-3.5" />
    </Link>
  );
}
