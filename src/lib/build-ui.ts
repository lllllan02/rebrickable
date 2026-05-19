import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";

export type BuildSubjectUi = {
  kind: BuildSubjectKind;
  /** 列表/详情页主称呼，如「MOC」「套装」 */
  noun: string;
  /** 列表页标题后缀，如「与已存零件表」 */
  listTitleSuffix: string;
  /** 列表页 kicker（小标题） */
  listKicker: string;
  /** 详情侧栏 kicker */
  detailSidebarKicker: string;
  /** 主体 ID 字段说明 */
  subjectIdLabel: string;
  /** 返回列表链接文案 */
  backToListLabel: string;
  /** Rebrickable 外链文案模板，需自行传入 ID */
  rbLinkLabel: (subjectId: string) => string;
  rebrickableUrl: (subjectId: string) => string;
};

export function buildSubjectUi(kind: BuildSubjectKind): BuildSubjectUi {
  if (kind === BUILD_SUBJECT_MOC) {
    return {
      kind,
      noun: "MOC",
      listTitleSuffix: "与已存零件表",
      listKicker: "MOC",
      detailSidebarKicker: "本地资料",
      subjectIdLabel: "MOC ID",
      backToListLabel: "返回 MOC 列表",
      rbLinkLabel: (id) => `在 Rebrickable 打开 MOC-${id}`,
      rebrickableUrl: (id) => `https://rebrickable.com/mocs/MOC-${encodeURIComponent(id)}/`,
    };
  }
  return {
    kind,
    noun: "套装",
    listTitleSuffix: "与已存零件表",
    listKicker: "套装",
    detailSidebarKicker: "本地资料",
    subjectIdLabel: "set_num",
    backToListLabel: "返回套装列表",
    rbLinkLabel: (id) => `在 Rebrickable 打开套装 ${id}`,
    rebrickableUrl: (id) => `https://rebrickable.com/sets/${encodeURIComponent(id)}/`,
  };
}

export function isBuildSubjectMoc(kind: BuildSubjectKind): kind is typeof BUILD_SUBJECT_MOC {
  return kind === BUILD_SUBJECT_MOC;
}
