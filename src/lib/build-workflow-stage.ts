import type { BuildSubjectKind } from "@/lib/build-subject";

/** 拼搭进度：收录 → 复刻 → 购入 → 完成 */
export const BUILD_WORKFLOW_STAGES = ["collected", "replicate", "purchase", "complete"] as const;

export type BuildWorkflowStage = (typeof BUILD_WORKFLOW_STAGES)[number];

export type WorkflowSubjectKind = BuildSubjectKind;

export const BUILD_WORKFLOW_DEFAULT_STAGE: BuildWorkflowStage = "collected";

/** 列表 URL 筛选（不含收录：列表页对收录无特殊展示） */
export const LIST_WORKFLOW_MARK_STAGES = ["replicate", "purchase", "complete"] as const;

export type ListWorkflowMarkStage = (typeof LIST_WORKFLOW_MARK_STAGES)[number];

export const BUILD_WORKFLOW_STAGE_LABELS: Record<BuildWorkflowStage, string> = {
  collected: "收录",
  replicate: "复刻",
  purchase: "购入",
  complete: "完成",
};

export const BUILD_WORKFLOW_STAGE_HINTS: Record<BuildWorkflowStage, string> = {
  collected: "已纳入待拼列表，资料已就绪",
  replicate: "在 Studio 等软件中复刻 / 搭建模型",
  purchase: "模型已就绪，待购入零件",
  complete: "零件已齐或作品已完成",
};

const LEGACY_STAGE_MAP: Record<string, BuildWorkflowStage> = {
  collected: "collected",
  replicate: "replicate",
  purchase: "purchase",
  complete: "complete",
  restore: "replicate",
  procure: "purchase",
  owned: "complete",
};

export function normalizeWorkflowStage(raw: string): BuildWorkflowStage | null {
  const v = raw.trim().toLowerCase();
  return LEGACY_STAGE_MAP[v] ?? null;
}

export function isBuildWorkflowStage(v: string): v is BuildWorkflowStage {
  return normalizeWorkflowStage(v) != null;
}

export function parseBuildWorkflowStage(raw: string | undefined): BuildWorkflowStage | null {
  if (raw == null || raw === "") return null;
  return normalizeWorkflowStage(raw);
}

export function workflowStageIndex(stage: BuildWorkflowStage): number {
  return BUILD_WORKFLOW_STAGES.indexOf(stage);
}

/** 列表卡片描边：收录不突出 */
export function workflowStageCardClass(stage: BuildWorkflowStage | null | undefined): string {
  if (stage === "replicate") return " result-card--replicate";
  if (stage === "purchase") return " result-card--purchase";
  if (stage === "complete") return " result-card--complete";
  return "";
}

/** 列表角标文案：收录不显示 */
export function workflowStageListBadge(stage: BuildWorkflowStage | null | undefined): string | null {
  if (!stage || stage === "collected") return null;
  return BUILD_WORKFLOW_STAGE_LABELS[stage];
}
