/** 套装详情：Rebrickable 目录与官方库存摘要 */
export type SetDetailOfficialMeta = {
  setNum: string;
  catalogName: string | null;
  year: number | null;
  invVersion: number;
  invId: number;
  uniqueParts: number;
  sumQty: number;
  spareQty: number;
  heroThumb: string | null;
  heroIsSetBox: boolean;
};
