import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";

/** MOC 拼搭进度：收录 → 复刻 → 购入 → 完成 */
export const MOC_WORKFLOW_STAGES = ["collected", "replicate", "purchase", "complete"] as const;

/** 套装进度：收录 → 心动 → 拥有（复用 replicate / complete 字段） */
export const SET_WORKFLOW_STAGES = ["collected", "replicate", "complete"] as const;

/** @deprecated 与 MOC 阶段一致；新代码请用 `workflowStagesForKind` */
export const BUILD_WORKFLOW_STAGES = MOC_WORKFLOW_STAGES;

export type BuildWorkflowStage = (typeof BUILD_WORKFLOW_STAGES)[number];
export type SetWorkflowStage = (typeof SET_WORKFLOW_STAGES)[number];

export type WorkflowSubjectKind = BuildSubjectKind;

export const BUILD_WORKFLOW_DEFAULT_STAGE: BuildWorkflowStage = "collected";

/** MOC 列表 URL 筛选（不含收录） */
export const LIST_WORKFLOW_MARK_STAGES = ["replicate", "purchase", "complete"] as const;

/** 套装列表 URL 筛选（不含收录） */
export const SET_LIST_WORKFLOW_MARK_STAGES = ["replicate", "complete"] as const;

export type ListWorkflowMarkStage = (typeof LIST_WORKFLOW_MARK_STAGES)[number];
export type SetListWorkflowMarkStage = (typeof SET_LIST_WORKFLOW_MARK_STAGES)[number];

export const BUILD_WORKFLOW_STAGE_LABELS: Record<BuildWorkflowStage, string> = {
  collected: "收录",
  replicate: "复刻",
  purchase: "购入",
  complete: "完成",
};

const SET_WORKFLOW_STAGE_LABELS: Record<SetWorkflowStage, string> = {
  collected: "收录",
  replicate: "心动",
  complete: "拥有",
};

export const BUILD_WORKFLOW_STAGE_HINTS: Record<BuildWorkflowStage, string> = {
  collected: "已纳入待拼列表，资料已就绪",
  replicate: "在 Studio 等软件中复刻 / 搭建模型",
  purchase: "模型已就绪，待购入零件",
  complete: "零件已齐或作品已完成",
};

const SET_WORKFLOW_STAGE_HINTS: Record<SetWorkflowStage, string> = {
  collected: "已纳入套装列表，资料已就绪",
  replicate: "列入心愿单，计划购入",
  complete: "已拥有该套装",
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

export function workflowStagesForKind(kind: BuildSubjectKind): readonly BuildWorkflowStage[] {
  return kind === BUILD_SUBJECT_SET ? SET_WORKFLOW_STAGES : MOC_WORKFLOW_STAGES;
}

export function workflowStageLabel(stage: BuildWorkflowStage, kind: BuildSubjectKind): string {
  if (kind === BUILD_SUBJECT_SET) {
    const normalized = normalizeWorkflowStageForKind(stage, kind);
    if (normalized && normalized !== "purchase") {
      return SET_WORKFLOW_STAGE_LABELS[normalized as SetWorkflowStage];
    }
  }
  return BUILD_WORKFLOW_STAGE_LABELS[stage];
}

export function workflowStageHint(stage: BuildWorkflowStage, kind: BuildSubjectKind): string {
  if (kind === BUILD_SUBJECT_SET) {
    const normalized = normalizeWorkflowStageForKind(stage, kind);
    if (normalized && normalized !== "purchase") {
      return SET_WORKFLOW_STAGE_HINTS[normalized as SetWorkflowStage];
    }
  }
  return BUILD_WORKFLOW_STAGE_HINTS[stage];
}

export function listMarkFilterOptionsForKind(
  kind: BuildSubjectKind
): { key: "all" | ListWorkflowMarkStage | SetListWorkflowMarkStage; label: string }[] {
  if (kind === BUILD_SUBJECT_SET) {
    return [
      { key: "all", label: "全部" },
      { key: "replicate", label: "心动" },
      { key: "complete", label: "拥有" },
    ];
  }
  return [
    { key: "all", label: "全部" },
    { key: "replicate", label: "复刻" },
    { key: "purchase", label: "购入" },
    { key: "complete", label: "完成" },
  ];
}

export function normalizeWorkflowStage(raw: string): BuildWorkflowStage | null {
  const v = raw.trim().toLowerCase();
  return LEGACY_STAGE_MAP[v] ?? null;
}

/** 套装旧数据中的「购入」视为「拥有」 */
export function normalizeWorkflowStageForKind(
  raw: string | BuildWorkflowStage,
  kind: BuildSubjectKind
): BuildWorkflowStage | null {
  const stage = typeof raw === "string" ? normalizeWorkflowStage(raw) : raw;
  if (!stage) return null;
  if (kind === BUILD_SUBJECT_SET) {
    if (stage === "purchase") return "complete";
    if (!(SET_WORKFLOW_STAGES as readonly string[]).includes(stage)) return null;
  }
  return stage;
}

export function isBuildWorkflowStage(v: string): v is BuildWorkflowStage {
  return normalizeWorkflowStage(v) != null;
}

export function isWorkflowStageForKind(v: string, kind: BuildSubjectKind): boolean {
  return normalizeWorkflowStageForKind(v, kind) != null;
}

export function parseBuildWorkflowStage(raw: string | undefined): BuildWorkflowStage | null {
  if (raw == null || raw === "") return null;
  return normalizeWorkflowStage(raw);
}

export function workflowStageIndex(stage: BuildWorkflowStage, kind?: BuildSubjectKind): number {
  const stages = kind != null ? workflowStagesForKind(kind) : BUILD_WORKFLOW_STAGES;
  const normalized =
    kind === BUILD_SUBJECT_SET ? normalizeWorkflowStageForKind(stage, kind) ?? stage : stage;
  return stages.indexOf(normalized);
}

/** 列表卡片描边：收录不突出 */
export function workflowStageCardClass(
  stage: BuildWorkflowStage | null | undefined,
  kind?: BuildSubjectKind
): string {
  const normalized =
    stage != null && kind === BUILD_SUBJECT_SET
      ? normalizeWorkflowStageForKind(stage, kind)
      : stage;
  if (normalized === "replicate") return " result-card--replicate";
  if (normalized === "purchase") return " result-card--purchase";
  if (normalized === "complete") return " result-card--complete";
  return "";
}

/** 列表角标文案：收录不显示 */
export function workflowStageListBadge(
  stage: BuildWorkflowStage | null | undefined,
  kind?: BuildSubjectKind
): string | null {
  if (!stage || stage === "collected") return null;
  if (kind != null) return workflowStageLabel(stage, kind);
  return BUILD_WORKFLOW_STAGE_LABELS[stage];
}
