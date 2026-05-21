"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setBuildWorkflowStageAction,
  setBuildWorkflowStageTimestampAction,
} from "@/app/build/build-workflow-actions";
import { formatWorkflowStageTime } from "@/lib/build-workflow-timestamps";
import {
  BUILD_WORKFLOW_STAGE_HINTS,
  BUILD_WORKFLOW_STAGE_LABELS,
  BUILD_WORKFLOW_STAGES,
  workflowStageIndex,
  type BuildWorkflowStage,
  type WorkflowSubjectKind,
} from "@/lib/build-workflow-stage";
import type { WorkflowStageTimestamps } from "@/lib/build-workflow-timestamps";

type Props = {
  subjectKind: WorkflowSubjectKind;
  subjectId: string;
  initialStage: BuildWorkflowStage | null;
  initialTimes: WorkflowStageTimestamps;
};

export function BuildWorkflowProgressPanel({
  subjectKind,
  subjectId,
  initialStage,
  initialTimes,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<BuildWorkflowStage | null>(initialStage);
  const [times, setTimes] = useState(initialTimes);

  useEffect(() => {
    setStage(initialStage);
    setTimes(initialTimes);
  }, [
    initialStage,
    subjectId,
    subjectKind,
    initialTimes.collected,
    initialTimes.replicate,
    initialTimes.purchase,
    initialTimes.complete,
  ]);

  const activeIndex = stage != null ? workflowStageIndex(stage) : -1;

  const canEditStageTime = (s: BuildWorkflowStage, stageIndex: number) =>
    s !== "collected" && activeIndex >= 0 && stageIndex <= activeIndex;

  const refreshStageTime = (target: BuildWorkflowStage) => {
    const prevTimes = times;
    const now = new Date().toISOString();
    setTimes({ ...times, [target]: now });
    startTransition(async () => {
      const res = await setBuildWorkflowStageTimestampAction({
        subjectKind,
        subjectId,
        stage: target,
      });
      if (!res.ok) {
        setTimes(prevTimes);
        return;
      }
      router.refresh();
    });
  };

  const pickStage = (next: BuildWorkflowStage) => {
    const prevStage = stage;
    const prevTimes = times;
    const now = new Date().toISOString();
    const idx = workflowStageIndex(next);
    const optimistic: WorkflowStageTimestamps = { ...times };
    for (let i = 0; i <= idx; i++) {
      const s = BUILD_WORKFLOW_STAGES[i]!;
      if (!optimistic[s]) optimistic[s] = now;
    }
    setStage(next);
    setTimes(optimistic);
    startTransition(async () => {
      const res = await setBuildWorkflowStageAction({ subjectKind, subjectId, stage: next });
      if (!res.ok) {
        setStage(prevStage);
        setTimes(prevTimes);
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="workflow-detail-panel table-shell" aria-label="拼搭进度">
      <div className="workflow-detail-panel__head">
        <p className="page-kicker">拼搭进度</p>
        <p className="workflow-detail-panel__current text-xs text-[var(--muted)]">
          当前：
          <span className="font-medium text-[var(--accent)]">
            {stage ? BUILD_WORKFLOW_STAGE_LABELS[stage] : BUILD_WORKFLOW_STAGE_LABELS.collected}
          </span>
        </p>
      </div>
      <div className="workflow-progress workflow-progress--detail" role="group">
        <div className="workflow-progress__track">
          {BUILD_WORKFLOW_STAGES.map((s, i) => {
            const isPast = activeIndex >= 0 && i < activeIndex;
            const isCurrent = activeIndex === i;
            const timeLabel = formatWorkflowStageTime(times[s]);
            const stepClass = [
              "workflow-progress__step",
              isPast ? "workflow-progress__step--past" : "",
              isCurrent ? "workflow-progress__step--current" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const timeEditable = canEditStageTime(s, i);
            return (
              <div key={s} className="workflow-progress__segment">
                {i > 0 ? (
                  <span
                    className={`workflow-progress__connector${isPast || isCurrent ? " workflow-progress__connector--filled" : ""}`}
                    aria-hidden
                  />
                ) : null}
                <div className={stepClass}>
                  <button
                    type="button"
                    disabled={pending}
                    className="workflow-progress__step-main"
                    title={BUILD_WORKFLOW_STAGE_HINTS[s]}
                    aria-label={`${BUILD_WORKFLOW_STAGE_LABELS[s]}${isCurrent ? "（当前）" : ""}`}
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => pickStage(s)}
                  >
                    <span className="workflow-progress__dot" aria-hidden />
                    <span className="workflow-progress__label">{BUILD_WORKFLOW_STAGE_LABELS[s]}</span>
                  </button>
                  {s === "collected" ? (
                    <time className="workflow-progress__time" dateTime={times[s] ?? undefined}>
                      {timeLabel ?? "—"}
                    </time>
                  ) : (
                    <button
                      type="button"
                      disabled={pending || !timeEditable}
                      className={`workflow-progress__time-btn${timeEditable ? " workflow-progress__time-btn--editable" : ""}`}
                      title={timeEditable ? "点击更新为当前时间" : "尚未到达此阶段"}
                      aria-label={
                        timeEditable
                          ? `${BUILD_WORKFLOW_STAGE_LABELS[s]}时间：${timeLabel ?? "未记录"}，点击更新为当前时间`
                          : `${BUILD_WORKFLOW_STAGE_LABELS[s]}时间：尚未到达此阶段`
                      }
                      onClick={() => refreshStageTime(s)}
                    >
                      <time className="workflow-progress__time" dateTime={times[s] ?? undefined}>
                        {timeLabel ?? "—"}
                      </time>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
