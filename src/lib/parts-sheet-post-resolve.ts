import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export type PartsSheetResolveResponse = {
  skippedHeader: boolean;
  items: ShortageResolveItem[];
  error?: string;
  lineNumber?: number | null;
};

export async function postResolvePartsSheetCsv(csv: string): Promise<PartsSheetResolveResponse> {
  const res = await fetch("/api/parts-sheet/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv }),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `请求失败（${res.status}）`;
    const ln =
      typeof data === "object" &&
      data !== null &&
      "lineNumber" in data &&
      typeof (data as { lineNumber: unknown }).lineNumber === "number"
        ? (data as { lineNumber: number }).lineNumber
        : null;
    return { skippedHeader: false, items: [], error: err, lineNumber: ln };
  }
  const ok = data as { skippedHeader?: unknown; items?: unknown };
  return {
    skippedHeader: Boolean(ok.skippedHeader),
    items: Array.isArray(ok.items) ? (ok.items as ShortageResolveItem[]) : [],
  };
}
