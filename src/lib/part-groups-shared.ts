export const PART_GROUP_NAME_MAX_LEN = 40;

export type PartsNavMode = "cat" | "group";

/** 自定义分组筛选：全部 / 待分组 / 具体组 id */
export type PartGroupFilter = "all" | "ungrouped" | number;

export type PartGroupNavRow = {
  id: number;
  name: string;
  count: number;
};

export function parsePartsNavMode(
  raw: string | undefined,
  fallback: PartsNavMode = "cat"
): PartsNavMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "group") return "group";
  if (v === "cat") return "cat";
  return fallback;
}

export function parsePartGroupFilter(
  raw: string | undefined
): PartGroupFilter | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || trimmed === "all") return "all";
  if (trimmed === "ungrouped") return "ungrouped";
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0 || String(n) !== trimmed) return null;
  return n;
}

export function partGroupFilterQueryValue(filter: PartGroupFilter): string {
  return typeof filter === "number" ? String(filter) : filter;
}
