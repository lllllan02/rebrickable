"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { PartFavoriteToggle } from "@/app/parts/part-favorite-toggle";
import { PurchaseListAddToggle } from "@/app/parts/purchase/purchase-list-add-toggle";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import type { MocPartUsageEnrichedRow } from "@/lib/moc-part-usage-stats";
import {
  defaultDirForSortKey,
  MOC_PART_USAGE_SORT_OPTIONS,
  parseMocPartUsageSort,
  sortMocPartUsageRows,
  type MocPartUsageSortDir,
  type MocPartUsageSortKey,
} from "@/lib/moc-part-usage-sort";

function formatScore(n: number): string {
  return n.toFixed(4);
}

function formatPct(coverage: number): string {
  return `${(coverage * 100).toFixed(1)}%`;
}

export function MocPartUsageRankTable({
  rows,
  initialSortKey = "score",
  initialSortDir,
  syncUrl = false,
}: {
  rows: MocPartUsageEnrichedRow[];
  initialSortKey?: MocPartUsageSortKey;
  initialSortDir?: MocPartUsageSortDir;
  /** 为 true 时把 sort/dir 写入 URL query（详情页） */
  syncUrl?: boolean;
}) {
  const initial = parseMocPartUsageSort(
    initialSortKey,
    initialSortDir ?? defaultDirForSortKey(initialSortKey)
  );
  const [sortKey, setSortKey] = useState<MocPartUsageSortKey>(initial.key);
  const [sortDir, setSortDir] = useState<MocPartUsageSortDir>(initial.dir);

  const sorted = useMemo(
    () => sortMocPartUsageRows(rows, sortKey, sortDir),
    [rows, sortKey, sortDir]
  );

  function applySort(nextKey: MocPartUsageSortKey, nextDir: MocPartUsageSortDir) {
    setSortKey(nextKey);
    setSortDir(nextDir);
    if (syncUrl && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      sp.set("sort", nextKey);
      sp.set("dir", nextDir);
      const qs = sp.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--muted)]">没有可统计的零件。</p>;
  }

  return (
    <div className="space-y-3">
      <details className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/80 px-3 py-2 text-xs leading-relaxed text-[var(--muted)]">
        <summary className="cursor-pointer select-none text-[var(--text)]">
          Score / RelMean 说明
        </summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-4">
          <li>
            <span className="font-medium text-[var(--text)]">RelMean</span>
            ：作品内相对重要性。对每个用到该零件的作品，先算 Rel = 该零件用量 ÷
            该作用量最高的零件用量（该作最常用件为 1.0），再对这些 Rel 取平均。用来削弱「大作品 / 海量同款件」对排名的扭曲。
          </li>
          <li>
            <span className="font-medium text-[var(--text)]">覆盖率</span>
            ：用过该零件的作品数 ÷ 有效参与统计的作品数 N。
          </li>
          <li>
            <span className="font-medium text-[var(--text)]">Score</span>
            ：综合分 = 覆盖率 × RelMean。既常见、又在用到它的作品里用量相对突出的零件会排在前面。
          </li>
        </ul>
      </details>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[10rem] flex-col gap-1">
          <label htmlFor="moc-part-usage-sort-key" className="text-xs text-[var(--muted)]">
            排序
          </label>
          <select
            id="moc-part-usage-sort-key"
            value={sortKey}
            onChange={(e) => {
              const key = e.target.value as MocPartUsageSortKey;
              applySort(key, defaultDirForSortKey(key));
            }}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]/50"
          >
            {MOC_PART_USAGE_SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => applySort(sortKey, sortDir === "asc" ? "desc" : "asc")}
          className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text)] transition-colors hover:border-[var(--accent)]/35"
        >
          {sortDir === "desc" ? "降序" : "升序"}
        </button>
      </div>

      <div className="table-shell overflow-x-auto bg-[var(--surface)]">
        <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border-soft)] text-xs text-[var(--muted)]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">零件</th>
              <th
                className="px-3 py-2 font-medium tabular-nums"
                title="综合分 = 覆盖率 × RelMean"
              >
                Score
              </th>
              <th
                className="px-3 py-2 font-medium"
                title="用过该零件的作品数 ÷ 有效作品数 N"
              >
                覆盖率
              </th>
              <th
                className="px-3 py-2 font-medium tabular-nums"
                title="各作用量相对该作最高用量零件的平均值（仅统计用过该件的作品）"
              >
                RelMean
              </th>
              <th className="px-3 py-2 font-medium tabular-nums">总用量</th>
              <th className="px-3 py-2 font-medium">待购</th>
              <th className="px-3 py-2 font-medium">收藏</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, idx) => (
              <tr
                key={r.partNum}
                className="border-b border-[var(--border-soft)]/70 last:border-0 hover:bg-[var(--surface-2)]/60"
              >
                <td className="px-3 py-2 tabular-nums text-[var(--muted)]">{idx + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-neutral-300/25 bg-white">
                      {r.imgUrl ? (
                        <RemoteCoverImage
                          src={r.imgUrl}
                          width={40}
                          height={40}
                          className="h-full w-full object-contain p-0.5"
                          sizes="40px"
                          fallbackLabel="无图"
                          fallbackClassName="!text-[8px]"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[8px] text-[var(--muted)]">
                          无图
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/parts/${encodeURIComponent(r.partNum)}`}
                        className="font-mono text-xs font-semibold text-[var(--accent)] no-underline hover:underline"
                      >
                        {r.partNum}
                      </Link>
                      <p className="truncate text-xs text-[var(--muted)]">
                        {r.partName ?? "未收录零件名"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums text-[var(--text)]">
                  {formatScore(r.score)}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--text)]">
                  {r.mocCount}/{r.selectedMocCount}
                  <span className="ml-1 text-[var(--muted)]">({formatPct(r.coverage)})</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums text-[var(--text)]">
                  {formatScore(r.relMeanAmongUsers)}
                </td>
                <td className="px-3 py-2 text-xs tabular-nums text-[var(--muted)]">
                  {r.totalQtyAcrossMocs.toLocaleString("zh-CN")}
                </td>
                <td className="px-3 py-2">
                  <PurchaseListAddToggle
                    partNum={r.partNum}
                    initialInList={r.inPurchaseList}
                    compact
                  />
                </td>
                <td className="px-3 py-2">
                  <PartFavoriteToggle partNum={r.partNum} initialFavorite={r.isFavorite} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
