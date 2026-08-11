"use server";

import {
  computeMocPartUsageForMocIds,
  MOC_PART_USAGE_MAX_MOCS,
  normalizeMocPartUsageIds,
} from "@/lib/moc-part-usage-compute";
import type { MocPartUsageEnrichedRow, MocPartUsageSkipped } from "@/lib/moc-part-usage-stats";

export type { MocPartUsageEnrichedRow, MocPartUsageSkipped };

export type AnalyzeMocPartUsageResult =
  | {
      ok: true;
      analyzedMocIds: string[];
      skipped: MocPartUsageSkipped[];
      rows: MocPartUsageEnrichedRow[];
    }
  | { ok: false; error: string };

export async function analyzeMocPartUsageAction(mocIdsRaw: unknown): Promise<AnalyzeMocPartUsageResult> {
  const mocIds = normalizeMocPartUsageIds(mocIdsRaw);
  if (mocIds == null) {
    return { ok: false, error: `请选择不超过 ${MOC_PART_USAGE_MAX_MOCS} 个有效的 MOC。` };
  }
  if (mocIds.length === 0) {
    return { ok: false, error: "请至少选择一个 MOC。" };
  }

  const result = await computeMocPartUsageForMocIds(mocIds);
  return {
    ok: true,
    analyzedMocIds: result.analyzedMocIds,
    skipped: result.skipped,
    rows: result.rows,
  };
}
