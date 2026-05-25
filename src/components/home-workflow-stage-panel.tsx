"use client";

import { BuildWorkflowStageListMark } from "@/components/build-workflow-stage-list-mark";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import type { HomeWorkflowMarkKey } from "@/lib/home-workflow-list-href";
import { listMarkFilterOptionsForKind, type BuildWorkflowStage } from "@/lib/build-workflow-stage";

type StageTileTone = "violet" | "sky" | "amber" | "rose" | "sand";

const MOC_STAGE_TILE_TONE: Record<HomeWorkflowMarkKey, StageTileTone> = {
  all: "violet",
  replicate: "sky",
  purchase: "sand",
  complete: "amber",
};

const SET_STAGE_TILE_TONE: Record<HomeWorkflowMarkKey, StageTileTone> = {
  all: "violet",
  replicate: "rose",
  purchase: "sand",
  complete: "amber",
};

function stageTileTone(kind: BuildSubjectKind, key: HomeWorkflowMarkKey): StageTileTone {
  const map = kind === BUILD_SUBJECT_MOC ? MOC_STAGE_TILE_TONE : SET_STAGE_TILE_TONE;
  return map[key] ?? "violet";
}

function AllStagesIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function formatStageCount(n: number) {
  return Number(n).toLocaleString("zh-CN");
}

/** 首页 MOC / 套装区块：切换阶段以筛选下方预览 */
export function HomeWorkflowStagePanel({
  subjectKind,
  counts,
  activeMark,
  onMarkChange,
}: {
  subjectKind: BuildSubjectKind;
  counts: Record<string, number>;
  activeMark: HomeWorkflowMarkKey;
  onMarkChange: (mark: HomeWorkflowMarkKey) => void;
}) {
  const options = listMarkFilterOptionsForKind(subjectKind);
  const panelLabel = subjectKind === BUILD_SUBJECT_MOC ? "MOC 拼搭进度" : "套装拼搭进度";

  return (
    <div className="workflow-stage-panel" aria-label={panelLabel} role="tablist">
      <ul className="workflow-stage-panel-grid">
        {options.map((opt) => {
          const key = opt.key as HomeWorkflowMarkKey;
          const count = counts[opt.key] ?? 0;
          const tone = stageTileTone(subjectKind, key);
          const active = activeMark === key;
          return (
            <li key={opt.key}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${opt.label}${count > 0 ? ` ${formatStageCount(count)} 条` : ""}`}
                className={`catalog-stat-tile catalog-stat-tile--tone-${tone} workflow-stage-panel-tile workflow-stage-panel-tile--btn${
                  active ? " workflow-stage-panel-tile--active" : ""
                }`}
                onClick={() => onMarkChange(key)}
              >
                <span className="workflow-stage-panel-tile-head">
                  {opt.key === "all" ? (
                    <span className="workflow-stage-panel-all-icon" aria-hidden>
                      <AllStagesIcon className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span className="workflow-stage-panel-mark" aria-hidden>
                      <BuildWorkflowStageListMark
                        stage={opt.key as BuildWorkflowStage}
                        subjectKind={subjectKind}
                      />
                    </span>
                  )}
                  <span className="workflow-stage-panel-label">{opt.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
