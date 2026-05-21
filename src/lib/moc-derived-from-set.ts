import "server-only";

import { and, eq } from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import { buildProfiles, legoSets } from "@/db/schema";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { parseMocDerivationSequence } from "@/lib/moc-from-set-id";

export type MocDerivedFromSetMeta = {
  setNum: string;
  catalogName: string | null;
};

/** 读取 MOC 改编自的官方套装；优先 `derived_from_set_num`，否则从 ID 形如 `{setNum}-NNN` 推断 */
export async function loadMocDerivedFromSetMeta(
  mocId: string
): Promise<MocDerivedFromSetMeta | null> {
  const id = mocId.trim();
  if (!id) return null;

  const db = getUserDb();
  const [prof] = await db
    .select({ derivedFromSetNum: buildProfiles.derivedFromSetNum })
    .from(buildProfiles)
    .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), eq(buildProfiles.subjectId, id)))
    .limit(1);

  let setNum = (prof?.derivedFromSetNum ?? "").trim();
  if (!setNum) {
    const dash = id.lastIndexOf("-");
    if (dash <= 0) return null;
    const candidate = id.slice(0, dash);
    if (parseMocDerivationSequence(candidate, id) == null) return null;
    setNum = candidate;
  }

  const catalogDb = getCatalogDb();
  const [catalog] = await catalogDb
    .select({ name: legoSets.name })
    .from(legoSets)
    .where(eq(legoSets.setNum, setNum))
    .limit(1);

  return {
    setNum,
    catalogName: catalog?.name ?? null,
  };
}

export async function listDerivedMocsForSet(setNum: string): Promise<
  { mocId: string; displayName: string }[]
> {
  const set = setNum.trim();
  if (!set) return [];

  const db = getUserDb();
  const rows = await db
    .select({
      subjectId: buildProfiles.subjectId,
      displayName: buildProfiles.displayName,
    })
    .from(buildProfiles)
    .where(
      and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), eq(buildProfiles.derivedFromSetNum, set))
    );

  return rows
    .map((r) => ({
      mocId: r.subjectId,
      displayName: (r.displayName ?? "").trim(),
    }))
    .sort((a, b) => a.mocId.localeCompare(b.mocId, "zh-CN"));
}
