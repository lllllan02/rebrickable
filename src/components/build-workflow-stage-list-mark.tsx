import { BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import {
  workflowStageHint,
  workflowStageLabel,
  type BuildWorkflowStage,
} from "@/lib/build-workflow-stage";

function SetHeartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function WorkflowCheckIcon({ className }: { className?: string }) {
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

/** 复刻：积木块 */
function MocReplicateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M4 8h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" opacity="0.35" />
      <path d="M6 6h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2z" />
      <circle cx="9" cy="11" r="1.35" />
      <circle cx="15" cy="11" r="1.35" />
      <circle cx="9" cy="15" r="1.35" />
      <circle cx="15" cy="15" r="1.35" />
    </svg>
  );
}

/** 购入：购物车 */
function MocPurchaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <path
        d="M3 5h2l1.2 6.2M7 11h11l2.5-7H6.2M7 11l-1.2 6.2M7 11h11M9 19a1.25 1.25 0 100-2.5A1.25 1.25 0 009 19zm8 0a1.25 1.25 0 100-2.5A1.25 1.25 0 0017 19z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
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
        <WorkflowCheckIcon className="h-4 w-4" />
      </span>
    );
  }
  return null;
}

function MocWorkflowListMark({
  stage,
  label,
  hint,
}: {
  stage: BuildWorkflowStage;
  label: string;
  hint: string;
}) {
  const badgeBase =
    "pointer-events-none inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-[0_1px_4px_rgba(0,0,0,0.45)] ring-1 ring-black/15";

  if (stage === "replicate") {
    return (
      <span
        className={`${badgeBase} border-sky-600 bg-sky-600 text-white`}
        title={`${label}：${hint}`}
        aria-label={`拼搭进度：${label}`}
      >
        <MocReplicateIcon className="h-4 w-4" />
      </span>
    );
  }
  if (stage === "purchase") {
    return (
      <span
        className={`${badgeBase} border-orange-600 bg-orange-600 text-white`}
        title={`${label}：${hint}`}
        aria-label={`拼搭进度：${label}`}
      >
        <MocPurchaseIcon className="h-4 w-4" />
      </span>
    );
  }
  if (stage === "complete") {
    return (
      <span
        className={`${badgeBase} border-[var(--accent-dim)] bg-[var(--accent)] text-[#141414]`}
        title={`${label}：${hint}`}
        aria-label={`拼搭进度：${label}`}
      >
        <WorkflowCheckIcon className="h-4 w-4" />
      </span>
    );
  }
  return null;
}

/** 列表卡片角标：MOC 用积木 / 购物车 / 勾号；套装用心形 / 勾号图标 */
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

  return <MocWorkflowListMark stage={stage} label={label} hint={hint} />;
}
