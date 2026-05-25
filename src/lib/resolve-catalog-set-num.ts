import { asc, eq, like } from "drizzle-orm";

import type { getCatalogDb } from "@/db/client";
import { legoSets } from "@/db/schema";

export type ResolveCatalogSetNumResult =
  | { ok: true; setNum: string }
  | { ok: false; error: string };

const MAX_VARIANT_CANDIDATES = 12;

/** 将用户输入的套装编号解析为目录中的 canonical `set_num`（支持省略 `-1` 变体后缀）。 */
export async function resolveCatalogSetNum(
  catalogDb: ReturnType<typeof getCatalogDb>,
  raw: string
): Promise<ResolveCatalogSetNumResult> {
  const input = raw.trim();
  if (!input) {
    return { ok: false, error: "套装编号无效。" };
  }

  const [exact] = await catalogDb
    .select({ setNum: legoSets.setNum })
    .from(legoSets)
    .where(eq(legoSets.setNum, input))
    .limit(1);
  if (exact) {
    return { ok: true, setNum: exact.setNum };
  }

  if (input.includes("-")) {
    return { ok: false, error: "目录中未找到该套装编号。" };
  }

  const defaultVariant = `${input}-1`;
  const [variant1] = await catalogDb
    .select({ setNum: legoSets.setNum })
    .from(legoSets)
    .where(eq(legoSets.setNum, defaultVariant))
    .limit(1);
  if (variant1) {
    return { ok: true, setNum: variant1.setNum };
  }

  const candidates = await catalogDb
    .select({ setNum: legoSets.setNum })
    .from(legoSets)
    .where(like(legoSets.setNum, `${input}-%`))
    .orderBy(asc(legoSets.setNum))
    .limit(MAX_VARIANT_CANDIDATES);

  if (candidates.length === 1) {
    return { ok: true, setNum: candidates[0]!.setNum };
  }
  if (candidates.length > 1) {
    const listed = candidates.map((c) => c.setNum).join("、");
    return {
      ok: false,
      error: `找到多个变体（${listed}），请填写完整套装编号。`,
    };
  }

  return { ok: false, error: "目录中未找到该套装编号。" };
}
