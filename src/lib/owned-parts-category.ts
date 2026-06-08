export type OwnedCategoryFilter = "all" | "uncategorized" | number;

export function parseOwnedCategoryParam(raw: string | undefined): OwnedCategoryFilter | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  if (trimmed === "all") return "all";
  if (trimmed === "uncategorized") return "uncategorized";
  const n = Number.parseInt(trimmed, 10);
  if (Number.isFinite(n) && n > 0 && String(n) === trimmed) return n;
  return null;
}

export function ownedCategoryQueryValue(filter: OwnedCategoryFilter): string {
  return typeof filter === "number" ? String(filter) : filter;
}
