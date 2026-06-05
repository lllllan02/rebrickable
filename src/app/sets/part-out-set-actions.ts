"use server";

import { and, eq } from "drizzle-orm";

import { setBuildWorkflowStageAction } from "@/app/build/build-workflow-actions";
import { getCatalogDb, getUserDb } from "@/db/client";
import { buildOwnedSubjects, legoSets } from "@/db/schema";
import { revalidateOwnedPartsPaths } from "@/lib/build-owned-parts-revalidate";
import { BUILD_SUBJECT_SET, isSafeBuildSubjectId } from "@/lib/build-subject";
import { workflowStageFromRow } from "@/lib/build-workflow-from-row";
import { mergeOwnedPartLines } from "@/lib/merge-owned-parts";
import { loadSetOfficialInventoryResolveItems } from "@/lib/set-official-inventory-resolve-items";
import { BUILD_UPLOAD_MAX_ID_LEN } from "@/lib/build-upload-storage";

export type PartOutSetResult =
  | { ok: true; lineCount: number; partQty: number; uniqueParts: number }
  | { ok: false; error: string };

/** 套装「杀肉」：解除拥有状态，并将官方库存零件写入散装拥有表 */
export async function partOutSetAction(setNumRaw: string): Promise<PartOutSetResult> {
  const setNum = setNumRaw.trim();
  if (!setNum || setNum.length > BUILD_UPLOAD_MAX_ID_LEN) {
    return { ok: false, error: "套装编号无效。" };
  }
  if (!isSafeBuildSubjectId(BUILD_SUBJECT_SET, setNum)) {
    return { ok: false, error: "套装编号含有非法字符。" };
  }

  const catalogDb = getCatalogDb();
  const [catalog] = await catalogDb
    .select({ setNum: legoSets.setNum })
    .from(legoSets)
    .where(eq(legoSets.setNum, setNum))
    .limit(1);
  if (!catalog) {
    return { ok: false, error: "目录中未找到该官方套装。" };
  }

  const userDb = getUserDb();
  const key = and(
    eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_SET),
    eq(buildOwnedSubjects.subjectId, setNum)
  );
  const [ownedRow] = await userDb.select().from(buildOwnedSubjects).where(key).limit(1);
  const stage = workflowStageFromRow(ownedRow, BUILD_SUBJECT_SET);
  if (stage !== "complete") {
    return { ok: false, error: "仅「拥有」状态的官方套装可杀肉。" };
  }

  const items = await loadSetOfficialInventoryResolveItems(setNum);
  if (items.length === 0) {
    return { ok: false, error: "该套装暂无官方库存行，无法杀肉。" };
  }

  const lines = items.map((it) => ({
    partNum: it.partNum,
    colorId: it.colorId,
    quantity: it.quantity,
  }));
  const partQty = lines.reduce((a, l) => a + l.quantity, 0);
  const uniqueParts = new Set(lines.map((l) => l.partNum)).size;

  try {
    await mergeOwnedPartLines(lines);

    const workflowRes = await setBuildWorkflowStageAction({
      subjectKind: BUILD_SUBJECT_SET,
      subjectId: setNum,
      stage: "collected",
    });
    if (!workflowRes.ok) {
      return { ok: false, error: workflowRes.error };
    }

    revalidateOwnedPartsPaths([...new Set(lines.map((l) => l.partNum))]);
    return { ok: true, lineCount: lines.length, partQty, uniqueParts };
  } catch {
    return { ok: false, error: "杀肉失败，请重试。" };
  }
}
