import type { ResolveShortageCsvDbResult } from "@/lib/parts-sheet-resolve-csv-db";
import { resolveShortageCsvInDb } from "@/lib/parts-sheet-resolve-csv-db";
import type { StudioIoPlacement } from "@/lib/parse-studio-io";
import { serializeShortageCsv } from "@/lib/serialize-shortage-csv";

function placementsToCsvRows(placements: StudioIoPlacement[]): {
  partNum: string;
  colorId: number;
  quantity: number;
  rest: string;
}[] {
  const map = new Map<string, { partNum: string; colorId: number; quantity: number; rest: string }>();
  for (const p of placements) {
    const partNum = p.isSubmodelRef ? p.partNum : p.partNum;
    const colorId = p.ldrawColorId;
    const key = `${partNum}\t${colorId}`;
    const rest = p.isSubmodelRef
      ? `Studio 子组件（未展开）: ${p.submodelName ?? p.partNum}`
      : "Studio .io 导入";
    const cur = map.get(key);
    if (cur) {
      cur.quantity += 1;
    } else {
      map.set(key, { partNum, colorId, quantity: 1, rest });
    }
  }
  return [...map.values()];
}

export async function resolveStudioIoPlacementsInDb(
  placements: StudioIoPlacement[]
): Promise<ResolveShortageCsvDbResult> {
  if (placements.length === 0) {
    return { ok: true, skippedHeader: true, items: [] };
  }
  const rows = placementsToCsvRows(placements);
  const csv = serializeShortageCsv(
    rows.map((r) => ({
      partNum: r.partNum,
      colorId: r.colorId,
      quantity: r.quantity,
      rest: r.rest,
    })),
    { includeHeader: true }
  );
  return resolveShortageCsvInDb(csv);
}
