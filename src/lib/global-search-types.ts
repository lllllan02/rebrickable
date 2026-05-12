export type GlobalSearchPartHit = {
  type: "part";
  title: string;
  subtitle: string;
  href: string;
  /** 结果页由库存聚合的示意缩略图 */
  imgUrl?: string | null;
};

export type GlobalSearchSetHit = {
  type: "set";
  title: string;
  subtitle: string;
  href: string;
  imgUrl: string | null;
};

export type GlobalSearchMocHit = {
  type: "moc";
  title: string;
  subtitle: string;
  href: string;
  imgUrl: string | null;
};

export type GlobalSearchColorHit = {
  type: "color";
  title: string;
  subtitle: string;
  href: string;
  rgb: string;
};

export type GlobalSearchElementHit = {
  type: "element";
  title: string;
  subtitle: string;
  href: string;
  partNum: string;
  /** 与零件共用该 part 的库存缩略图 */
  imgUrl?: string | null;
};

export type GlobalSearchPayload = {
  mocs: GlobalSearchMocHit[];
  sets: GlobalSearchSetHit[];
  parts: GlobalSearchPartHit[];
  colors: GlobalSearchColorHit[];
  elements: GlobalSearchElementHit[];
};

export function emptyGlobalSearchPayload(): GlobalSearchPayload {
  return {
    mocs: [],
    sets: [],
    parts: [],
    colors: [],
    elements: [],
  };
}
