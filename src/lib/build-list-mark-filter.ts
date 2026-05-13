export type ListMarkFilter = "all" | "owned" | "favorite";

export function parseListMarkFilter(raw: string | undefined): ListMarkFilter {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "all" || v === "") return "all";
  if (v === "owned" || v === "favorite") return v;
  return "all";
}
