import type { SetListMarkFilter } from "@/lib/build-list-mark-filter";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { mocListHref } from "@/lib/moc-list-href";
import { setListHref } from "@/lib/set-list-href";
import type { ListWorkflowMarkStage, SetListWorkflowMarkStage } from "@/lib/build-workflow-stage";

export type HomeWorkflowMarkKey = "all" | ListWorkflowMarkStage | SetListWorkflowMarkStage;

/** 首页「查看更多」链接：携带当前阶段筛选 */
export function homeWorkflowListHref(kind: BuildSubjectKind, mark: HomeWorkflowMarkKey): string {
  if (kind === BUILD_SUBJECT_MOC) {
    return mocListHref({ mark: mark === "all" ? undefined : (mark as ListWorkflowMarkStage) });
  }
  const setMark: SetListMarkFilter | undefined =
    mark === "all" ? undefined : (mark as SetListWorkflowMarkStage);
  return setListHref({ mark: setMark, theme: "all" });
}
