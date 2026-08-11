"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  analyzeMocPartUsageAction,
  type AnalyzeMocPartUsageResult,
  type MocPartUsageEnrichedRow,
  type MocPartUsageSkipped,
} from "@/app/mocs/moc-part-usage-actions";
import { saveMocPartUsageReportAction } from "@/app/mocs/moc-part-usage-report-actions";
import { MocPartUsageRankTable } from "@/app/mocs/part-usage/moc-part-usage-rank-table";
import { RemoteCoverImage } from "@/components/remote-cover-image";

export type MocPartUsageCandidate = {
  mocId: string;
  title: string;
  coverUrl: string | null;
  tags: string[];
  totalPartQty: number;
};

const MAX_SELECT = 100;

function defaultReportName(activeTag: string | null | undefined): string {
  const tag = (activeTag ?? "").trim();
  if (tag) return tag;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `零件使用率 ${y}-${m}-${day}`;
}

export function MocPartUsageClient({
  candidates,
  activeTag,
}: {
  candidates: MocPartUsageCandidate[];
  /** 当前生效的标签展示名；无标签筛选时为 null */
  activeTag?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();
  const [savePending, startSaveTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [analyzedMocIds, setAnalyzedMocIds] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<MocPartUsageSkipped[]>([]);
  const [rows, setRows] = useState<MocPartUsageEnrichedRow[] | null>(null);
  const [saveName, setSaveName] = useState(() => defaultReportName(activeTag));
  const [saveOpen, setSaveOpen] = useState(false);

  const allIds = useMemo(() => candidates.map((c) => c.mocId), [candidates]);
  const selectCap = Math.min(allIds.length, MAX_SELECT);
  const selectedCount = selected.size;
  const selectedInView = useMemo(
    () => allIds.filter((id) => selected.has(id)).length,
    [allIds, selected]
  );
  const allSelectableSelected =
    selectCap > 0 && selectedInView >= selectCap && selectedCount === selectCap;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        if (next.size >= MAX_SELECT) return prev;
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allIds.slice(0, MAX_SELECT)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function runAnalyze() {
    setError(null);
    startTransition(async () => {
      const res: AnalyzeMocPartUsageResult = await analyzeMocPartUsageAction([...selected]);
      if (!res.ok) {
        setError(res.error);
        setRows(null);
        setAnalyzedMocIds([]);
        setSkipped([]);
        return;
      }
      setAnalyzedMocIds(res.analyzedMocIds);
      setSkipped(res.skipped);
      setRows(res.rows);
      setSaveName(defaultReportName(activeTag));
      setSaveOpen(false);
    });
  }

  function runSave() {
    setError(null);
    startSaveTransition(async () => {
      const res = await saveMocPartUsageReportAction({
        name: saveName,
        tagHint: activeTag ?? null,
        mocIds: [...selected],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/mocs/part-usage/${res.reportId}`);
    });
  }

  return (
    <div className="space-y-8">
      <section className="section-panel space-y-4" aria-labelledby="moc-part-usage-select-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="moc-part-usage-select-heading" className="text-base font-semibold text-[var(--text)]">
              选择作品
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {activeTag ? (
                <>
                  标签「<span className="text-[var(--text)]">{activeTag}</span>」下共 {candidates.length} 个
                  MOC
                </>
              ) : (
                <>当前共 {candidates.length} 个 MOC</>
              )}
              ；已选 {selectedCount} 个（最多 {MAX_SELECT}）。
              {allIds.length > MAX_SELECT ? `「全选」将选中前 ${MAX_SELECT} 个。` : null}
              仅统计完整零件表，按 partNum 忽略颜色。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              disabled={candidates.length === 0 || allSelectableSelected}
              className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--text)] transition-colors hover:border-[var(--accent)]/35 disabled:opacity-40"
            >
              {allIds.length > MAX_SELECT ? `全选（前 ${MAX_SELECT} 个）` : "全选当前筛选"}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedCount === 0}
              className="rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--border)] hover:text-[var(--text)] disabled:opacity-40"
            >
              清空
            </button>
            <button
              type="button"
              onClick={runAnalyze}
              disabled={pending || selectedCount === 0}
              className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]/15 disabled:opacity-40"
            >
              {pending ? "统计中…" : "开始统计"}
            </button>
          </div>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">当前筛选下没有可分析的 MOC。</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => {
              const checked = selected.has(c.mocId);
              const atCap = !checked && selectedCount >= MAX_SELECT;
              const inputId = `moc-part-usage-${c.mocId}`;
              return (
                <li key={c.mocId}>
                  <label
                    htmlFor={inputId}
                    className={`flex gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                      atCap ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    } ${
                      checked
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]/50"
                        : "border-[var(--border-soft)] bg-[var(--surface-2)] hover:border-[var(--accent)]/35"
                    }`}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => toggle(c.mocId)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-neutral-300/25 bg-white">
                      {c.coverUrl ? (
                        <RemoteCoverImage
                          src={c.coverUrl}
                          fill
                          className="object-cover"
                          sizes="56px"
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
                      <p className="truncate text-sm font-medium text-[var(--text)]">{c.title}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">{c.mocId}</p>
                      <p className="mt-0.5 text-[11px] tabular-nums text-[var(--muted)]">
                        {c.totalPartQty.toLocaleString("zh-CN")} 粒
                      </p>
                      {c.tags.length > 0 ? (
                        <p className="mt-1 truncate text-[11px] text-[var(--muted-2)]">
                          {c.tags.join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {error ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      {rows != null ? (
        <section className="section-panel space-y-4" aria-labelledby="moc-part-usage-result-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="moc-part-usage-result-heading" className="text-base font-semibold text-[var(--text)]">
                零件使用率排行
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                有效作品 N = {analyzedMocIds.length}
                {skipped.length > 0 ? `；跳过 ${skipped.length} 个` : null}
                。可切换排序；保存后可反复查看并增删作品重算。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSaveOpen((v) => !v)}
              disabled={selectedCount === 0}
              className="shrink-0 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]/15 disabled:opacity-40"
            >
              保存排行榜
            </button>
          </div>

          {saveOpen ? (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] p-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="moc-part-usage-save-name" className="text-xs text-[var(--muted)]">
                  名称
                </label>
                <input
                  id="moc-part-usage-save-name"
                  type="text"
                  value={saveName}
                  maxLength={80}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)]/50"
                />
              </div>
              <button
                type="button"
                onClick={runSave}
                disabled={savePending || !saveName.trim()}
                className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]/15 disabled:opacity-40"
              >
                {savePending ? "保存中…" : "确认保存"}
              </button>
            </div>
          ) : null}

          {skipped.length > 0 ? (
            <details className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-2 text-sm">
              <summary className="cursor-pointer text-[var(--muted)]">跳过明细</summary>
              <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                {skipped.map((s) => (
                  <li key={s.mocId}>
                    <span className="font-mono text-[var(--text)]">{s.mocId}</span> — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <MocPartUsageRankTable rows={rows} />
        </section>
      ) : null}
    </div>
  );
}
