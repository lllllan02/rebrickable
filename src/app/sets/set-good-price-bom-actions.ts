"use server";

import { eq, inArray } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { colors, legoSets } from "@/db/schema";
import { BUILD_SUBJECT_SET, isSafeBuildSubjectId } from "@/lib/build-subject";
import { resolveCatalogSetNum } from "@/lib/resolve-catalog-set-num";
import { loadSetOfficialInventoryResolveItems } from "@/lib/set-official-inventory-resolve-items";
import {
  shortageResolveItemsToBomPreviewLines,
  sumSetBomPreviewPieceQty,
  type SetBomPreviewLine,
} from "@/lib/set-bom-preview-groups";

export type FetchSetGoodPriceBomPreviewResult =
  | {
      ok: true;
      setNum: string;
      catalogName: string | null;
      lines: SetBomPreviewLine[];
      totalPieceQty: number;
      sparePieceQty: number;
    }
  | { ok: false; error: string };

export async function fetchSetGoodPriceBomPreviewAction(input: {
  setNum: string;
}): Promise<FetchSetGoodPriceBomPreviewResult> {
  const setNum = input.setNum.trim();
  if (!setNum || !isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号无效。" };
  }

  try {
    const catalogDb = getCatalogDb();
    const resolved = await resolveCatalogSetNum(catalogDb, setNum);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    const canonicalSetNum = resolved.setNum;

    const items = await loadSetOfficialInventoryResolveItems(canonicalSetNum);
    if (items.length === 0) {
      return { ok: false, error: "本地无该套装官方 BOM，无法查看零件。" };
    }

    const colorIds = [...new Set(items.map((i) => i.colorId))];
    const colorRows =
      colorIds.length > 0
        ? await catalogDb
            .select({ id: colors.id, rgb: colors.rgb })
            .from(colors)
            .where(inArray(colors.id, colorIds))
        : [];
    const colorRgbById = new Map(colorRows.map((r) => [r.id, r.rgb?.trim() || null]));

    const lines = shortageResolveItemsToBomPreviewLines(items, colorRgbById);
    const sparePieceQty = lines.filter((l) => l.isSpare).reduce((s, l) => s + l.quantity, 0);

    const [setRow] = await catalogDb
      .select({ name: legoSets.name })
      .from(legoSets)
      .where(eq(legoSets.setNum, canonicalSetNum))
      .limit(1);
    const catalogName = setRow?.name?.trim() || null;

    return {
      ok: true,
      setNum: canonicalSetNum,
      catalogName,
      lines,
      totalPieceQty: sumSetBomPreviewPieceQty(lines),
      sparePieceQty,
    };
  } catch {
    return { ok: false, error: "加载零件清单失败，请重试。" };
  }
}
