"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  commitIoStepSplitAction,
  loadIoSplitContextAction,
  previewIoStepSplitAction,
  type IoSplitPreviewBatch,
  type IoSplitPreviewStep,
} from "@/app/mocs/io-split-actions";
import { buildSubjectDetailPath, mocIoBatchPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { ioSplitPackageLabel } from "@/lib/io-split-labels";
import {
  buildManualIoSplitGroups,
  formatIoMainStepLabel,
} from "@/lib/io-split-step-display";
import {
  defaultRuleLabelForConfig,
  estimateIoSplitOutline,
  type IoSplitConfig,
  type IoSplitMode,
} from "@/lib/studio-io-split";

type Props = {
  mocId: string;
  attachmentId: number;
  attachmentLabel: string;
};

type SplitModeUi = IoSplitMode;

type EffectRow = {
  label: string;
  stepFrom: number;
  stepTo: number;
  stepIndexes: number[];
  pieceCount: number;
  lineCount: number | null;
  unresolvedSubmodelCount: number | null;
};

function formatStepListLabel(s: IoSplitPreviewStep): string {
  return formatIoMainStepLabel(s.stepIndex, s.title);
}

function stepCellShortLabel(stepIndex: number): string {
  return String(Math.max(1, stepIndex));
}

const MANUAL_BATCH_CELL_STYLES = [
  "border-[var(--accent)] bg-[var(--accent)] text-white",
  "border-sky-400/60 bg-sky-500/40 text-sky-50",
  "border-emerald-400/60 bg-emerald-500/40 text-emerald-50",
  "border-violet-400/60 bg-violet-500/40 text-violet-50",
  "border-amber-400/60 bg-amber-500/40 text-amber-50",
] as const;

function manualStepCellClass(
  ownerIdx: number,
  activeGroupIdx: number,
  isActiveEnd: boolean
): string {
  if (ownerIdx < 0) {
    return "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--accent)]/40";
  }
  const palette = MANUAL_BATCH_CELL_STYLES[ownerIdx % MANUAL_BATCH_CELL_STYLES.length]!;
  const dimmed = ownerIdx !== activeGroupIdx ? " opacity-75" : "";
  const endRing = isActiveEnd ? " ring-2 ring-white/90 ring-offset-1 ring-offset-[var(--surface-2)]" : "";
  return `${palette}${dimmed}${endRing}`;
}

type ManualGroup = { label: string; stepIndexes: number[] };

function findStepGroupIndex(groups: ManualGroup[], stepIndex: number): number {
  return groups.findIndex((g) => g.stepIndexes.includes(stepIndex));
}

function orderedStepIndexes(steps: IoSplitPreviewStep[]): number[] {
  return steps.map((s) => s.stepIndex);
}

/** 当前批次允许连选的起始位置（须紧接在前序批次之后） */
function rangeStartPosForGroup(ordered: number[], groups: ManualGroup[], groupIdx: number): number {
  if (groupIdx <= 0) return 0;
  let maxPos = -1;
  for (let i = 0; i < groupIdx; i++) {
    for (const idx of groups[i]!.stepIndexes) {
      const pos = ordered.indexOf(idx);
      if (pos > maxPos) maxPos = pos;
    }
  }
  return maxPos + 1;
}

/** 点击某步：本批次从起点连续选到该步（含），其后步骤从本批次移除 */
function applyContiguousSelect(
  ordered: number[],
  groups: ManualGroup[],
  groupIdx: number,
  endStepIndex: number
): { groups: ManualGroup[]; activeGroupIdx: number } {
  const endPos = ordered.indexOf(endStepIndex);
  if (endPos < 0) return { groups, activeGroupIdx: groupIdx };

  let gi = groupIdx;
  let startPos = rangeStartPosForGroup(ordered, groups, gi);

  if (endPos < startPos) {
    gi = Math.max(0, gi - 1);
    startPos = rangeStartPosForGroup(ordered, groups, gi);
    if (endPos < startPos) {
      gi = 0;
      startPos = 0;
    }
  }

  const selected = ordered.slice(startPos, endPos + 1);
  const selectedSet = new Set(selected);

  const next = groups.map((g, i) => {
    if (i === gi) return { ...g, stepIndexes: selected };
    return { ...g, stepIndexes: g.stepIndexes.filter((idx) => !selectedSet.has(idx)) };
  });

  return { groups: next, activeGroupIdx: gi };
}

export function MocIoSplitWizard({ mocId, attachmentId, attachmentLabel }: Props) {
  const router = useRouter();
  const [loadingCtx, startLoadCtx] = useTransition();
  const [previewBusy, startPreview] = useTransition();
  const [commitBusy, startCommit] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [modelName, setModelName] = useState("");
  const [studioVersion, setStudioVersion] = useState<string | null>(null);
  const [steps, setSteps] = useState<IoSplitPreviewStep[]>([]);
  const [existingBatchCount, setExistingBatchCount] = useState(0);

  const [mode, setMode] = useState<SplitModeUi>("by_color");
  const [planName, setPlanName] = useState("按颜色分包");
  const [planNameTouched, setPlanNameTouched] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(true);

  const [manualGroups, setManualGroups] = useState<ManualGroup[]>([
    { label: ioSplitPackageLabel(1), stepIndexes: [] },
  ]);
  const [activeManualGroupIdx, setActiveManualGroupIdx] = useState(0);

  const [previewBatches, setPreviewBatches] = useState<IoSplitPreviewBatch[] | null>(null);
  const previewGen = useRef(0);

  const mocHref = buildSubjectDetailPath(BUILD_SUBJECT_MOC, mocId);

  const hasBaseLayerStep = useMemo(() => steps.some((s) => s.stepIndex === 0), [steps]);

  const manualSteps = useMemo(
    () => steps.filter((s) => s.stepIndex > 0),
    [steps]
  );

  const config = useMemo((): IoSplitConfig => {
    if (mode === "manual") {
      return {
        mode,
        groups: buildManualIoSplitGroups(manualGroups, hasBaseLayerStep),
      };
    }
    return { mode };
  }, [mode, manualGroups, hasBaseLayerStep]);

  const defaultPlanName = useMemo(() => defaultRuleLabelForConfig(config), [config]);

  useEffect(() => {
    if (!planNameTouched) setPlanName(defaultPlanName);
  }, [defaultPlanName, planNameTouched]);

  const stepMeta = useMemo(
    () => steps.map((s) => ({ stepIndex: s.stepIndex, newPlacementCount: s.newPlacementCount })),
    [steps]
  );

  const outline = useMemo(() => estimateIoSplitOutline(stepMeta, config), [stepMeta, config]);

  const manualInvalid =
    mode === "manual" && config.mode === "manual" && config.groups.length === 0;

  const assignedStepCount = useMemo(() => {
    const set = new Set<number>();
    for (const g of manualGroups) {
      for (const idx of g.stepIndexes) {
        if (idx > 0) set.add(idx);
      }
    }
    return set.size;
  }, [manualGroups]);

  const unassignedStepCount = manualSteps.length - assignedStepCount;

  const orderedStepIdx = useMemo(
    () => orderedStepIndexes(mode === "manual" ? manualSteps : steps),
    [mode, manualSteps, steps]
  );

  const activeBatchEndPos = useMemo(() => {
    const g = manualGroups[activeManualGroupIdx];
    if (!g?.stepIndexes.length) return -1;
    return Math.max(...g.stepIndexes.map((idx) => orderedStepIdx.indexOf(idx)));
  }, [manualGroups, activeManualGroupIdx, orderedStepIdx]);

  const effectRows: EffectRow[] = useMemo(() => {
    if (previewBatches && previewBatches.length > 0) {
      return previewBatches.map((p) => ({
        label: p.label.trim() || "—",
        stepFrom: p.stepFrom,
        stepTo: p.stepTo,
        stepIndexes: p.stepIndexes,
        pieceCount: p.totalPartQty,
        lineCount: p.lineCount,
        unresolvedSubmodelCount: p.unresolvedSubmodelCount,
      }));
    }
    return outline.map((o, i) => ({
      label: o.label.trim() || ioSplitPackageLabel(i + 1),
      stepFrom: o.stepFrom,
      stepTo: o.stepTo,
      stepIndexes: o.stepIndexes,
      pieceCount: o.pieceCount,
      lineCount: null,
      unresolvedSubmodelCount: null,
    }));
  }, [previewBatches, outline]);

  const bagCount = effectRows.length;
  const totalPieces = effectRows.reduce((n, r) => n + r.pieceCount, 0);
  const previewReady = previewBatches != null && previewBatches.length > 0;
  const needsServerPreview = mode === "by_color" || mode === "by_category";
  const bagCountLabel =
    bagCount === 0
      ? manualInvalid
        ? "请为手动批次选择步骤"
        : steps.length === 0
          ? "加载步骤中…"
          : "无法拆分"
      : previewReady || !needsServerPreview
        ? `共 ${bagCount} 包`
        : `约 ${bagCount} 包（正在解析…）`;

  useEffect(() => {
    startLoadCtx(async () => {
      setError(null);
      const r = await loadIoSplitContextAction({ mocId, attachmentId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setModelName(r.modelName);
      setStudioVersion(r.studioVersion);
      setSteps(r.steps);
      setExistingBatchCount(r.existingBatchCount);
    });
  }, [mocId, attachmentId]);

  const runPreview = useCallback(() => {
    if (steps.length === 0 || manualInvalid) {
      setPreviewBatches(null);
      return;
    }
    const gen = ++previewGen.current;
    startPreview(async () => {
      const r = await previewIoStepSplitAction({ mocId, attachmentId, config });
      if (gen !== previewGen.current) return;
      if (!r.ok) {
        setPreviewBatches(null);
        return;
      }
      setPreviewBatches(r.batches);
    });
  }, [mocId, attachmentId, config, manualInvalid, steps.length]);

  useEffect(() => {
    if (steps.length === 0) return;
    const t = window.setTimeout(() => {
      runPreview();
    }, 400);
    return () => window.clearTimeout(t);
  }, [steps.length, config, runPreview]);

  const onPreview = useCallback(() => {
    setError(null);
    setMessage(null);
    if (manualInvalid) {
      setError("请至少为一组选择主场景步骤。");
      return;
    }
    runPreview();
  }, [manualInvalid, runPreview]);

  const onCommit = useCallback(() => {
    setError(null);
    setMessage(null);
    if (bagCount === 0) {
      setError(manualInvalid ? "请至少为一组选择主场景步骤。" : "当前设置无法拆分出有效包。");
      return;
    }
    startCommit(async () => {
      const r = await commitIoStepSplitAction({
        mocId,
        attachmentId,
        config,
        ruleLabel: planName.trim() || defaultPlanName,
        replaceExisting,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMessage(
        `已保存 ${r.count} 张分包（${r.gobricksMessage}）可在 MOC 详情「零件表」中查看各包高砖可购零件与汇总缺件。`,
      );
      if (r.batchIds.length === 1) {
        router.push(mocIoBatchPath(mocId, r.batchIds[0]!));
      } else if (r.batchIds.length > 0) {
        router.push(`${mocHref}#moc-parts-sheet-tools`);
        router.refresh();
      }
    });
  }, [
    mocId,
    attachmentId,
    config,
    replaceExisting,
    router,
    mocHref,
    bagCount,
    manualInvalid,
    planName,
    defaultPlanName,
  ]);

  const contiguousSelectThrough = (stepIndex: number) => {
    const ordered = orderedStepIndexes(mode === "manual" ? manualSteps : steps);
    const { groups: next, activeGroupIdx } = applyContiguousSelect(
      ordered,
      manualGroups,
      activeManualGroupIdx,
      stepIndex
    );
    setManualGroups(next);
    setActiveManualGroupIdx(activeGroupIdx);
  };

  const selectThroughLastStep = () => {
    const list = mode === "manual" ? manualSteps : steps;
    const last = list[list.length - 1]?.stepIndex;
    if (last != null) contiguousSelectThrough(last);
  };

  const selectThroughSegmentEnd = () => {
    const ordered = orderedStepIndexes(mode === "manual" ? manualSteps : steps);
    const startPos = rangeStartPosForGroup(ordered, manualGroups, activeManualGroupIdx);
    let endPos = ordered.length - 1;
    for (let p = startPos; p < ordered.length; p++) {
      const owner = findStepGroupIndex(manualGroups, ordered[p]!);
      if (owner > activeManualGroupIdx) {
        endPos = p - 1;
        break;
      }
    }
    if (endPos >= startPos) contiguousSelectThrough(ordered[endPos]!);
  };

  const clearActiveGroup = () => {
    setManualGroups((prev) =>
      prev.map((g, i) => (i === activeManualGroupIdx ? { ...g, stepIndexes: [] } : g))
    );
  };

  const addManualGroup = () => {
    setManualGroups((prev) => {
      const next = [...prev, { label: ioSplitPackageLabel(prev.length + 1), stepIndexes: [] }];
      setActiveManualGroupIdx(next.length - 1);
      return next;
    });
  };

  const removeManualGroup = (gi: number) => {
    setManualGroups((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev
        .filter((_, i) => i !== gi)
        .map((g, i) => ({ ...g, label: ioSplitPackageLabel(i + 1) }));
      setActiveManualGroupIdx((cur) => {
        if (cur === gi) return Math.max(0, gi - 1);
        if (cur > gi) return cur - 1;
        return cur;
      });
      return next;
    });
  };

  const pending = loadingCtx || previewBusy || commitBusy;

  return (
    <div className="space-y-6">
      <div>
        <Link href={mocHref} className="text-sm text-[var(--accent)] underline underline-offset-2">
          ← 返回 MOC 详情
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-[var(--text)]">从 Studio .io 分步导出零件表</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          源文件：{attachmentLabel}
          {modelName ? ` · 模型 ${modelName}` : ""}
          {studioVersion ? ` · Studio ${studioVersion}` : ""}
        </p>
        {existingBatchCount > 0 ? (
          <p className="mt-2 text-xs text-amber-200/90">
            该附件已有 {existingBatchCount} 个分步批次；生成时可选择覆盖。
          </p>
        ) : null}
      </div>

      <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/50 p-4">
        <h2 className="text-sm font-medium text-[var(--text)]">拆分方式</h2>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {(
            [
              ["by_color", "按颜色：每种颜色一张表（整模）"],
              ["by_category", "按零件类别：每类一张表（整模）"],
              ["manual", "自定义：自选步骤归入各批次"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="splitMode"
                checked={mode === value}
                onChange={() => {
                  setMode(value);
                  setPlanNameTouched(false);
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-[var(--text)]">分包方案名称</span>
          <span className="ml-2 text-xs text-[var(--muted)]">仅创建时可设置，保存后不可修改</span>
          <input
            type="text"
            value={planName}
            maxLength={48}
            onChange={(e) => {
              setPlanNameTouched(true);
              setPlanName(e.target.value);
            }}
            className="mt-1.5 w-full max-w-md rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            placeholder={defaultPlanName}
          />
        </label>

        {mode === "manual" ? (
          <p className="mt-3 text-xs text-[var(--muted)]">请在下方「手动分包」区域点击方格划分步骤。</p>
        ) : null}

        <label className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(e) => setReplaceExisting(e.target.checked)}
          />
          覆盖本附件下相同拆分配置的已有分包（手动分包时各包名为分包1、分包2…）
        </label>
      </section>

      {mode === "manual" ? (
        <section className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-[var(--text)]">手动分包</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                先选批次，再点击步骤设定终点：从本包起点连续选到该步，之后的步骤自动移出本包。每步仅属一包。
              </p>
            </div>
            <p className="text-xs tabular-nums text-[var(--muted)]">
              已分配 {assignedStepCount}/{manualSteps.length} 步
              {unassignedStepCount > 0 ? ` · 未分配 ${unassignedStepCount} 步` : null}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {manualGroups.map((g, gi) => (
              <button
                key={gi}
                type="button"
                onClick={() => setActiveManualGroupIdx(gi)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  gi === activeManualGroupIdx
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)]/50"
                }`}
              >
                {ioSplitPackageLabel(gi + 1)}
                <span className="ml-1 opacity-80">({g.stepIndexes.length})</span>
              </button>
            ))}
            <button
              type="button"
              className="rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-xs text-[var(--accent)]"
              onClick={addManualGroup}
            >
              + 添加批次
            </button>
          </div>

          {manualGroups[activeManualGroupIdx] ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[var(--text)]">
                {ioSplitPackageLabel(activeManualGroupIdx + 1)}
              </span>
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline hover:text-[var(--text)]"
                onClick={selectThroughSegmentEnd}
                disabled={steps.length === 0}
              >
                连选至本段末尾
              </button>
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline hover:text-[var(--text)]"
                onClick={selectThroughLastStep}
                disabled={steps.length === 0}
              >
                连选至最后一步
              </button>
              <button
                type="button"
                className="text-xs text-[var(--muted)] underline hover:text-[var(--text)]"
                onClick={clearActiveGroup}
              >
                清空本批次
              </button>
              {manualGroups.length > 1 ? (
                <button
                  type="button"
                  className="text-xs text-red-300/90 underline hover:text-red-200"
                  onClick={() => removeManualGroup(activeManualGroupIdx)}
                >
                  删除本批次
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-md border border-[var(--border-soft)] bg-[var(--surface)]/30 p-3">
            <p className="text-xs text-[var(--muted)]">
              主场景 {manualSteps.length} 步 · 点击方格设定当前批次终点（从步骤 1 起）
            </p>
            {manualSteps.length === 0 ? (
              <p className="mt-3 py-4 text-center text-xs text-[var(--muted)]">正在加载步骤…</p>
            ) : (
              <div
                className="mt-2 flex max-h-[min(12rem,40vh)] flex-wrap content-start gap-1 overflow-y-auto"
                role="group"
                aria-label="主场景步骤方格"
              >
                {manualSteps.map((s) => {
                  const pos = orderedStepIdx.indexOf(s.stepIndex);
                  const ownerIdx = findStepGroupIndex(manualGroups, s.stepIndex);
                  const isActiveEnd =
                    ownerIdx === activeManualGroupIdx &&
                    pos === activeBatchEndPos &&
                    activeBatchEndPos >= 0;
                  const ownerLabel =
                    ownerIdx >= 0 ? ioSplitPackageLabel(ownerIdx + 1) : "未分配";
                  const tip = `${formatStepListLabel(s)} · 新增 ${s.newPlacementCount} 片 · ${ownerLabel}`;
                  return (
                    <button
                      key={s.stepIndex}
                      type="button"
                      title={tip}
                      aria-label={tip}
                      onClick={() => contiguousSelectThrough(s.stepIndex)}
                      onDoubleClick={() => {
                        if (ownerIdx >= 0) setActiveManualGroupIdx(ownerIdx);
                      }}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border text-[10px] font-medium tabular-nums transition-colors ${manualStepCellClass(ownerIdx, activeManualGroupIdx, isActiveEnd)}`}
                    >
                      {stepCellShortLabel(s.stepIndex)}
                    </button>
                  );
                })}
              </div>
            )}
            {manualGroups.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--muted)]">
                {manualGroups.map((g, gi) => (
                  <li key={gi} className="flex items-center gap-1">
                    <span
                      className={`inline-block h-3 w-3 rounded-sm border ${MANUAL_BATCH_CELL_STYLES[gi % MANUAL_BATCH_CELL_STYLES.length]}`}
                      aria-hidden
                    />
                    <button
                      type="button"
                      className={`underline-offset-2 hover:underline ${gi === activeManualGroupIdx ? "text-[var(--text)]" : ""}`}
                      onClick={() => setActiveManualGroupIdx(gi)}
                    >
                      {ioSplitPackageLabel(gi + 1)}
                    </button>
                  </li>
                ))}
                <li className="flex items-center gap-1">
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-[var(--border)] bg-[var(--surface)]"
                    aria-hidden
                  />
                  <span>未分配</span>
                </li>
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}

      <section
        className="rounded-lg border border-[var(--accent)]/35 bg-[var(--surface-2)]/60 p-4"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-[var(--text)]">拆分效果</h2>
          <p className="text-lg font-semibold tabular-nums text-[var(--accent)]">{bagCountLabel}</p>
        </div>
        {bagCount > 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">合计 {totalPieces} 片</p>
        ) : null}

        {bagCount > 0 ? (
          <ul className="mt-3 divide-y divide-[var(--border-soft)] rounded-md border border-[var(--border-soft)] bg-[var(--surface)]/40">
            {effectRows.map((row, i) => (
              <li
                key={`${row.label}-${i}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium text-[var(--text)]">{row.label}</span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">{row.pieceCount} 片</span>
              </li>
            ))}
          </ul>
        ) : null}

      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || steps.length === 0}
          className="button-primary text-sm disabled:opacity-50"
          onClick={() => void onPreview()}
        >
          {previewBusy ? "解析中…" : "刷新预览"}
        </button>
        <button
          type="button"
          disabled={pending || bagCount === 0}
          className="rounded-md border border-[var(--accent)] px-4 py-2 text-sm text-[var(--accent)] disabled:opacity-50"
          onClick={() => void onCommit()}
        >
          {commitBusy ? "保存中…" : "生成并保存"}
        </button>
      </div>

      {message ? (
        <p className="text-sm text-emerald-200/95" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-200/95" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
