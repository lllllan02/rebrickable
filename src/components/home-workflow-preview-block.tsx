"use client";

import { useMemo, useState } from "react";

import { SavedSubjectListRow } from "@/app/build/saved-subject-list-row";
import { HomeListStrip } from "@/app/home-list-strip";
import { HomeWorkflowStagePanel } from "@/components/home-workflow-stage-panel";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { homeWorkflowListHref, type HomeWorkflowMarkKey } from "@/lib/home-workflow-list-href";
import { mocListHref } from "@/lib/moc-list-href";
import { workflowStageLabel, type BuildWorkflowStage } from "@/lib/build-workflow-stage";

export type HomeWorkflowPreviewItem = {
  subjectId: string;
  workflowStage: BuildWorkflowStage | null;
  detailHref: string;
  title: string;
  coverUrl: string | null;
  tags: string[];
  totalPartQty: number;
  updatedAtIso: string;
  showInstructionBadge: boolean;
  showSourceBadge: boolean;
  shortageLineCount: number | null;
  shortageTotalQty: number | null;
  shortageClearedAt: string | null;
  gobricksShortageSyncAt: string | null;
  gobricksGdsPriceCny: number | null;
};

const PREVIEW_LI = "min-w-0";

function filterByMark(items: HomeWorkflowPreviewItem[], mark: HomeWorkflowMarkKey): HomeWorkflowPreviewItem[] {
  if (mark === "all") return items;
  return items.filter((item) => item.workflowStage === mark);
}

/** 阶段面板切换本地预览；右上角链接跳转完整列表 */
export function HomeWorkflowPreviewBlock({
  subjectKind,
  counts,
  items,
  previewCap,
  moreLabel,
  emptyStageHint,
}: {
  subjectKind: BuildSubjectKind;
  counts: Record<string, number>;
  items: HomeWorkflowPreviewItem[];
  previewCap: number;
  moreLabel: string;
  emptyStageHint?: string;
}) {
  const [mark, setMark] = useState<HomeWorkflowMarkKey>("all");

  const filtered = useMemo(() => filterByMark(items, mark), [items, mark]);
  const preview = filtered.slice(0, previewCap);
  const filteredTotal = mark === "all" ? counts.all ?? items.length : (counts[mark] ?? 0);
  const moreHref = homeWorkflowListHref(subjectKind, mark);
  const stageLabel =
    mark === "all" ? "全部" : workflowStageLabel(mark as BuildWorkflowStage, subjectKind);

  return (
    <>
      <HomeWorkflowStagePanel
        subjectKind={subjectKind}
        counts={counts}
        activeMark={mark}
        onMarkChange={setMark}
      />
      {filteredTotal > 0 ? (
        <HomeListStrip
          heading=""
          total={filteredTotal}
          moreHref={moreHref}
          moreLabel={moreLabel}
          previewCap={previewCap}
          hideCategoryTitle
          overflowHint={
            <>
              当前「{stageLabel}」另有{" "}
              <span className="tabular-nums font-medium text-[var(--text)]">
                {(filteredTotal - previewCap).toLocaleString("zh-CN")}
              </span>{" "}
              条未在此列出，请点击右上角链接查看。
            </>
          }
        >
          {preview.map((item) => (
            <SavedSubjectListRow
              key={`${subjectKind}-${item.subjectId}`}
              className={PREVIEW_LI}
              kind={subjectKind}
              subjectId={item.subjectId}
              detailHref={item.detailHref}
              title={item.title}
              coverUrl={item.coverUrl}
              tags={item.tags}
              mocTagHref={subjectKind === BUILD_SUBJECT_MOC ? (tag) => mocListHref({ tag }) : undefined}
              totalPartQty={item.totalPartQty}
              shortageLineCount={item.shortageLineCount}
              shortageTotalQty={item.shortageTotalQty}
              shortageClearedAt={item.shortageClearedAt}
              gobricksShortageSyncAt={item.gobricksShortageSyncAt}
              gobricksGdsPriceCny={item.gobricksGdsPriceCny}
              updatedAtIso={item.updatedAtIso}
              workflowStage={item.workflowStage}
              showInstructionBadge={item.showInstructionBadge}
              showSourceBadge={item.showSourceBadge}
            />
          ))}
        </HomeListStrip>
      ) : items.length > 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {emptyStageHint ?? `「${stageLabel}」阶段暂无条目，可切换其他阶段或前往列表添加。`}
        </p>
      ) : null}
    </>
  );
}
