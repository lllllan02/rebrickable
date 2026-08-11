"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  addMocsToPartUsageReportAction,
  deleteMocPartUsageReportAction,
  recomputeMocPartUsageReportAction,
  removeMocFromPartUsageReportAction,
  updateMocPartUsageReportNameAction,
  type MocPartUsageReportMoc,
} from "@/app/mocs/moc-part-usage-report-actions";
import type { MocPartUsageCandidate } from "@/app/mocs/part-usage/moc-part-usage-client";
import { MocPartUsageRankTable } from "@/app/mocs/part-usage/moc-part-usage-rank-table";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { formatIsoDateTimeFull } from "@/lib/format-display-time";
import type { MocPartUsageEnrichedRow, MocPartUsageSkipped } from "@/lib/moc-part-usage-stats";
import {
  parseMocPartUsageSort,
  type MocPartUsageSortDir,
  type MocPartUsageSortKey,
} from "@/lib/moc-part-usage-sort";

const MAX_SELECT = 100;

export function MocPartUsageReportClient({
  reportId,
  initialName,
  tagHint,
  analyzedAt,
  initialMocs,
  initialRows,
  addCandidates,
  initialSortKey,
  initialSortDir,
}: {
  reportId: number;
  initialName: string;
  tagHint: string | null;
  analyzedAt: string;
  initialMocs: MocPartUsageReportMoc[];
  initialRows: MocPartUsageEnrichedRow[];
  addCandidates: MocPartUsageCandidate[];
  initialSortKey?: string;
  initialSortDir?: string;
}) {
  const router = useRouter();
  const parsedSort = parseMocPartUsageSort(initialSortKey, initialSortDir);

  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [mocs, setMocs] = useState(initialMocs);
  const [rows, setRows] = useState(initialRows);
  const [analyzedAtState, setAnalyzedAtState] = useState(analyzedAt);
  const [skipped, setSkipped] = useState<MocPartUsageSkipped[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [addSelected, setAddSelected] = useState<Set<string>>(() => new Set());

  const memberIds = useMemo(() => new Set(mocs.map((m) => m.mocId)), [mocs]);
  const available = useMemo(
    () => addCandidates.filter((c) => !memberIds.has(c.mocId)),
    [addCandidates, memberIds]
  );
  const room = Math.max(0, MAX_SELECT - mocs.length);

  function applyComputeResult(res: {
    rows: MocPartUsageEnrichedRow[];
    skipped: MocPartUsageSkipped[];
  }) {
    setRows(res.rows);
    setSkipped(res.skipped);
    setAnalyzedAtState(new Date().toISOString());
    router.refresh();
  }

  function rename() {
    setError(null);
    startTransition(async () => {
      const res = await updateMocPartUsageReportNameAction({ reportId, name });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedName(name.trim());
      router.refresh();
    });
  }

  function removeMoc(mocId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeMocFromPartUsageReportAction({ reportId, mocId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMocs((prev) => prev.filter((m) => m.mocId !== mocId));
      applyComputeResult(res);
    });
  }

  function recompute() {
    setError(null);
    startTransition(async () => {
      const res = await recomputeMocPartUsageReportAction({ reportId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      applyComputeResult(res);
    });
  }

  function addSelectedMocs() {
    setError(null);
    startTransition(async () => {
      const ids = [...addSelected];
      const res = await addMocsToPartUsageReportAction({ reportId, mocIds: ids });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const addedCards = available.filter((c) => addSelected.has(c.mocId)).map(
        (c): MocPartUsageReportMoc => ({
          mocId: c.mocId,
          title: c.title,
          coverUrl: c.coverUrl,
          tags: c.tags,
        })
      );
      setMocs((prev) => [...prev, ...addedCards]);
      setAddSelected(new Set());
      setAddOpen(false);
      applyComputeResult(res);
    });
  }

  function deleteReport() {
    if (!window.confirm(`确定删除排行榜「${name}」？`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteMocPartUsageReportAction({ reportId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/mocs/part-usage");
    });
  }

  function toggleAdd(id: string) {
    setAddSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= room) return prev;
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-8">
      <section className="section-panel space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="report-name" className="text-xs text-[var(--muted)]">
              名称
            </label>
            <input
              id="report-name"
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/50"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={rename}
              disabled={pending || !name.trim() || name.trim() === savedName}
              className="rounded-lg border border-[var(--border-soft)] px-3 py-2 text-xs text-[var(--text)] disabled:opacity-40"
            >
              重命名
            </button>
            <button
              type="button"
              onClick={recompute}
              disabled={pending}
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-2 text-xs font-medium text-[var(--text)] disabled:opacity-40"
            >
              {pending ? "处理中…" : "按当前零件表重算"}
            </button>
            <button
              type="button"
              onClick={deleteReport}
              disabled={pending}
              className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-200/90 disabled:opacity-40"
            >
              删除报告
            </button>
          </div>
        </div>
        <p className="text-sm text-[var(--muted)]">
          {tagHint ? (
            <>
              题材标签「<span className="text-[var(--text)]">{tagHint}</span>」·{" "}
            </>
          ) : null}
          {mocs.length} 个作品 · 分析于{" "}
          {formatIsoDateTimeFull(analyzedAtState) ?? analyzedAtState.slice(0, 19)}
        </p>
      </section>

      {error ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <details className="group section-panel space-y-4" aria-labelledby="report-mocs-heading">
        <summary className="flex cursor-pointer list-none items-center gap-2 select-none [&::-webkit-details-marker]:hidden">
          <span
            className="inline-block text-[10px] leading-none text-[var(--muted-2)] transition-transform duration-200 group-open:rotate-90"
            aria-hidden
          >
            ▶
          </span>
          <h2 id="report-mocs-heading" className="text-base font-semibold text-[var(--text)]">
            作品集
          </h2>
          <span className="text-xs text-[var(--muted)]">（{mocs.length} 个，点击展开）</span>
        </summary>

        <div className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              disabled={room <= 0}
              className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text)] disabled:opacity-40"
            >
              {addOpen ? "收起添加" : "添加作品"}
            </button>
          </div>

          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {mocs.map((m) => (
              <li
                key={m.mocId}
                className="flex gap-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2.5"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-neutral-300/25 bg-white">
                  {m.coverUrl ? (
                    <RemoteCoverImage
                      src={m.coverUrl}
                      fill
                      className="object-cover"
                      sizes="48px"
                      fallbackLabel="无图"
                      fallbackClassName="!text-[9px]"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]">
                      无图
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/mocs/${encodeURIComponent(m.mocId)}`}
                    className="truncate text-sm font-medium text-[var(--accent)] no-underline hover:underline"
                  >
                    {m.title}
                  </Link>
                  <p className="font-mono text-[11px] text-[var(--muted)]">{m.mocId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeMoc(m.mocId)}
                  disabled={pending || mocs.length <= 1}
                  className="shrink-0 self-start rounded border border-[var(--border-soft)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>

          {addOpen ? (
            <div className="space-y-3 border-t border-[var(--border-soft)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--muted)]">
                  可添加 {available.length} 个；本次最多再选 {room} 个（已选 {addSelected.size}）。
                </p>
                <button
                  type="button"
                  onClick={addSelectedMocs}
                  disabled={pending || addSelected.size === 0}
                  className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  确认添加并重算
                </button>
              </div>
              {available.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">没有更多可添加的作品。</p>
              ) : (
                <ul className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                  {available.map((c) => {
                    const checked = addSelected.has(c.mocId);
                    const atCap = !checked && addSelected.size >= room;
                    return (
                      <li key={c.mocId}>
                        <label
                          className={`flex cursor-pointer gap-2 rounded-lg border px-2.5 py-2 text-sm ${
                            checked
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]/50"
                              : "border-[var(--border-soft)] bg-[var(--surface)]"
                          } ${atCap ? "opacity-50" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={atCap}
                            onChange={() => toggleAdd(c.mocId)}
                            className="mt-0.5 accent-[var(--accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{c.title}</span>
                            <span className="font-mono text-[11px] text-[var(--muted)]">{c.mocId}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </details>

      {skipped.length > 0 ? (
        <details className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          <summary className="cursor-pointer text-[var(--muted)]">
            最近一次重算跳过 {skipped.length} 个
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
            {skipped.map((s) => (
              <li key={s.mocId}>
                <span className="font-mono text-[var(--text)]">{s.mocId}</span> — {s.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section className="section-panel space-y-4" aria-labelledby="report-rank-heading">
        <h2 id="report-rank-heading" className="text-base font-semibold text-[var(--text)]">
          零件使用率排行
        </h2>
        <MocPartUsageRankTable
          rows={rows}
          initialSortKey={parsedSort.key as MocPartUsageSortKey}
          initialSortDir={parsedSort.dir as MocPartUsageSortDir}
          syncUrl
        />
      </section>
    </div>
  );
}
