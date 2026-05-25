import {
  isBuildWorkflowStage,
  LIST_WORKFLOW_MARK_STAGES,
  normalizeWorkflowStage,
  SET_LIST_WORKFLOW_MARK_STAGES,
  type ListWorkflowMarkStage,
  type SetListWorkflowMarkStage,
} from "@/lib/build-workflow-stage";

/** 列表 / 目录 URL `mark` 筛选（MOC） */
export type ListMarkFilter = "all" | ListWorkflowMarkStage;

/** 套装目录 URL `mark` 筛选 */
export type SetListMarkFilter = "all" | SetListWorkflowMarkStage;

export function parseListMarkFilter(raw: string | undefined): ListMarkFilter {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "all" || v === "" || v === "favorite" || v === "collected") return "all";
  const normalized = normalizeWorkflowStage(v);
  if (
    normalized &&
    (LIST_WORKFLOW_MARK_STAGES as readonly string[]).includes(normalized)
  ) {
    return normalized as ListWorkflowMarkStage;
  }
  if (isBuildWorkflowStage(v) && v !== "collected") return v as ListWorkflowMarkStage;
  return "all";
}

export function parseSetListMarkFilter(raw: string | undefined): SetListMarkFilter {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "all" || v === "" || v === "favorite" || v === "collected") return "all";
  const normalized = normalizeWorkflowStage(v);
  if (normalized === "purchase") return "complete";
  if (
    normalized &&
    (SET_LIST_WORKFLOW_MARK_STAGES as readonly string[]).includes(normalized)
  ) {
    return normalized as SetListWorkflowMarkStage;
  }
  return "all";
}

export function isWorkflowMarkFilter(mark: ListMarkFilter): mark is ListWorkflowMarkStage {
  return mark !== "all";
}

export function isSetWorkflowMarkFilter(mark: SetListMarkFilter): mark is SetListWorkflowMarkStage {
  return mark !== "all";
}

export const LIST_MARK_FILTER_OPTIONS: { key: ListMarkFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "replicate", label: "复刻" },
  { key: "purchase", label: "购入" },
  { key: "complete", label: "完成" },
];
