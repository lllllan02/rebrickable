import { BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import {
  workflowStageHint,
  workflowStageLabel,
  type BuildWorkflowStage,
} from "@/lib/build-workflow-stage";

const MOC_MARK_BY_STAGE: Partial<
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

function SetHeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function SetCheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function SetWorkflowListMark({
  stage,
  label,
  hint,
}: {
  stage: BuildWorkflowStage;
  label: string;
  hint: string;
}) {
  if (stage === "replicate") {
    return (
      <span
        className="pointer-events-none inline-flex drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)]"
        title={`${label}：${hint}`}
        aria-label={`拼搭进度：${label}`}
      >
        <SetHeartIcon className="h-7 w-7 text-red-500" />
      </span>
    );
  }
  if (stage === "complete") {
    return (
      <span
        className="pointer-events-none inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-[#141414] shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-1 ring-black/15"
        title={`${label}：${hint}`}
        aria-label={`拼搭进度：${label}`}
      >
        <SetCheckIcon className="h-4 w-4" />
      </span>
    );
  }
  return null;
}

/** 列表卡片角标：MOC 用圆钮单字；套装用心形 / 勾号图标 */
export function BuildWorkflowStageListMark({
  stage,
  subjectKind = "moc",
}: {
  stage: BuildWorkflowStage | null;
  subjectKind?: BuildSubjectKind;
}) {
  if (!stage || stage === "collected") return null;

  const label = workflowStageLabel(stage, subjectKind);
  const hint = workflowStageHint(stage, subjectKind);

  if (subjectKind === BUILD_SUBJECT_SET) {
    return <SetWorkflowListMark stage={stage} label={label} hint={hint} />;
  }

  const mark = MOC_MARK_BY_STAGE[stage];
  if (!mark) return null;

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
