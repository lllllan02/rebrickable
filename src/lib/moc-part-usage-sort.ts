import type { MocPartUsageStatRow } from "@/lib/moc-part-usage-stats";

export type MocPartUsageSortKey =
  | "score"
  | "coverage"
  | "relMean"
  | "mocCount"
  | "totalQty"
  | "partNum";

export type MocPartUsageSortDir = "asc" | "desc";

export const MOC_PART_USAGE_SORT_OPTIONS: {
  key: MocPartUsageSortKey;
  label: string;
  defaultDir: MocPartUsageSortDir;
}[] = [
  { key: "score", label: "综合分 Score", defaultDir: "desc" },
  { key: "coverage", label: "覆盖率", defaultDir: "desc" },
  { key: "relMean", label: "RelMean", defaultDir: "desc" },
  { key: "mocCount", label: "出现作品数", defaultDir: "desc" },
  { key: "totalQty", label: "总用量", defaultDir: "desc" },
  { key: "partNum", label: "零件号", defaultDir: "asc" },
];

export function defaultDirForSortKey(key: MocPartUsageSortKey): MocPartUsageSortDir {
  return MOC_PART_USAGE_SORT_OPTIONS.find((o) => o.key === key)?.defaultDir ?? "desc";
}

export function parseMocPartUsageSort(
  sortRaw: string | undefined,
  dirRaw: string | undefined
): { key: MocPartUsageSortKey; dir: MocPartUsageSortDir } {
  const key = MOC_PART_USAGE_SORT_OPTIONS.some((o) => o.key === sortRaw)
    ? (sortRaw as MocPartUsageSortKey)
    : "score";
  const dir: MocPartUsageSortDir =
    dirRaw === "asc" || dirRaw === "desc" ? dirRaw : defaultDirForSortKey(key);
  return { key, dir };
}

function primaryValue(row: MocPartUsageStatRow, key: MocPartUsageSortKey): number | string {
  switch (key) {
    case "score":
      return row.score;
    case "coverage":
      return row.coverage;
    case "relMean":
      return row.relMeanAmongUsers;
    case "mocCount":
      return row.mocCount;
    case "totalQty":
      return row.totalQtyAcrossMocs;
    case "partNum":
      return row.partNum;
  }
}

/** 按指定键排序；并列时固定按 partNum 升序 */
export function sortMocPartUsageRows<T extends MocPartUsageStatRow>(
  rows: readonly T[],
  key: MocPartUsageSortKey,
  dir: MocPartUsageSortDir
): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = primaryValue(a, key);
    const vb = primaryValue(b, key);
    if (typeof va === "number" && typeof vb === "number") {
      if (va !== vb) return va < vb ? -mul : mul;
    } else {
      const cmp = String(va).localeCompare(String(vb), "en");
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
    }
    return a.partNum.localeCompare(b.partNum, "en");
  });
}
