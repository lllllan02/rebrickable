import {
  BUILD_WORKFLOW_STAGE_HINTS,
  BUILD_WORKFLOW_STAGE_LABELS,
  type BuildWorkflowStage,
} from "@/lib/build-workflow-stage";

const MARK_BY_STAGE: Partial<
  Record<
    BuildWorkflowStage,
    { symbol: string; btnClass: string }
  >
> = {
  replicate: {
    symbol: "复",
    btnClass: "border-sky-600 bg-sky-600 text-white shadow-sm ring-1 ring-black/20",
  },
  purchase: {
    symbol: "采",
    btnClass: "border-orange-600 bg-orange-600 text-white shadow-sm ring-1 ring-black/20",
  },
  complete: {
    symbol: "✓",
    btnClass:
      "border-[var(--accent-dim)] bg-[var(--accent)] text-[#141414] shadow-sm ring-1 ring-black/20",
  },
};

/** 列表卡片角标：样式对齐原「收藏/拥有」圆钮；收录与未标记不显示 */
export function BuildWorkflowStageListMark({
  stage,
}: {
  stage: BuildWorkflowStage | null;
}) {
  if (!stage || stage === "collected") return null;
  const mark = MARK_BY_STAGE[stage];
  if (!mark) return null;
  const label = BUILD_WORKFLOW_STAGE_LABELS[stage];
  const hint = BUILD_WORKFLOW_STAGE_HINTS[stage];

  return (
    <span
      className={`pointer-events-none inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold leading-none ${mark.btnClass}`}
      title={`${label}：${hint}`}
      aria-label={`拼搭进度：${label}`}
    >
      {mark.symbol}
    </span>
  );
}
