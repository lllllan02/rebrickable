import "server-only";

import { and, eq, inArray, isNotNull, min, ne } from "drizzle-orm";

import { getCatalogDb, getUserDb } from "@/db/client";
import { buildPartUpgrades, inventoryParts, parts } from "@/db/schema";
import { catalogPartExists } from "@/lib/load-favorite-parts";

const MAX_PART_NUM_LEN = 64;
const MAX_CHAIN_DEPTH = 32;

export type PartUpgradeEdge = {
  fromPartNum: string;
  toPartNum: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartUpgradeMeta = {
  partNum: string;
  name: string;
  thumbUrl: string | null;
};

export type PartUpgradeMutationResult =
  | { ok: true }
  | { ok: false; error: string };

function normalizePartNum(raw: string): string | null {
  const partNum = raw.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) return null;
  return partNum;
}

/** 批量：给定零件号中哪些有升级出边 → Map<from, to> */
export async function loadUpgradeTargetsForParts(
  partNums: readonly string[]
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(partNums.map((p) => p.trim()).filter(Boolean)),
  ];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const db = getUserDb();
  const rows = await db
    .select({
      fromPartNum: buildPartUpgrades.fromPartNum,
      toPartNum: buildPartUpgrades.toPartNum,
    })
    .from(buildPartUpgrades)
    .where(inArray(buildPartUpgrades.fromPartNum, unique));

  for (const r of rows) {
    map.set(r.fromPartNum, r.toPartNum);
  }
  return map;
}

/** 有升级出边则为 true（圆点条件） */
export async function partHasUpgrade(partNum: string): Promise<boolean> {
  const trimmed = normalizePartNum(partNum);
  if (!trimmed) return false;
  const map = await loadUpgradeTargetsForParts([trimmed]);
  return map.has(trimmed);
}

export async function getPartUpgradeEdge(
  fromPartNum: string
): Promise<PartUpgradeEdge | null> {
  const from = normalizePartNum(fromPartNum);
  if (!from) return null;
  const db = getUserDb();
  const [row] = await db
    .select()
    .from(buildPartUpgrades)
    .where(eq(buildPartUpgrades.fromPartNum, from))
    .limit(1);
  if (!row) return null;
  return {
    fromPartNum: row.fromPartNum,
    toPartNum: row.toPartNum,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** 哪些零件升级到本件（反向边） */
export async function loadUpgradesToPart(
  toPartNum: string
): Promise<PartUpgradeEdge[]> {
  const to = normalizePartNum(toPartNum);
  if (!to) return [];
  const db = getUserDb();
  const rows = await db
    .select()
    .from(buildPartUpgrades)
    .where(eq(buildPartUpgrades.toPartNum, to));
  return rows.map((row) => ({
    fromPartNum: row.fromPartNum,
    toPartNum: row.toPartNum,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

async function loadPartMeta(
  partNums: readonly string[]
): Promise<Map<string, PartUpgradeMeta>> {
  const unique = [...new Set(partNums.map((p) => p.trim()).filter(Boolean))];
  const map = new Map<string, PartUpgradeMeta>();
  if (unique.length === 0) return map;

  const catalogDb = getCatalogDb();
  const [nameRows, thumbRows] = await Promise.all([
    catalogDb
      .select({ partNum: parts.partNum, name: parts.name })
      .from(parts)
      .where(inArray(parts.partNum, unique)),
    catalogDb
      .select({
        partNum: inventoryParts.partNum,
        thumb: min(inventoryParts.imgUrl),
      })
      .from(inventoryParts)
      .where(
        and(
          inArray(inventoryParts.partNum, unique),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        )
      )
      .groupBy(inventoryParts.partNum),
  ]);

  const thumbBy = new Map<string, string>();
  for (const t of thumbRows) {
    if (t.thumb) thumbBy.set(t.partNum, t.thumb);
  }
  for (const n of nameRows) {
    map.set(n.partNum, {
      partNum: n.partNum,
      name: n.name,
      thumbUrl: thumbBy.get(n.partNum) ?? null,
    });
  }
  return map;
}

export async function loadPartUpgradeDetail(partNum: string): Promise<{
  outbound: (PartUpgradeEdge & { to: PartUpgradeMeta }) | null;
  inbound: Array<PartUpgradeEdge & { from: PartUpgradeMeta }>;
  latestPartNum: string;
}> {
  const from = normalizePartNum(partNum) ?? partNum.trim();
  const [edge, inbound] = await Promise.all([
    getPartUpgradeEdge(from),
    loadUpgradesToPart(from),
  ]);
  const latestPartNum = await resolveLatestPartNum(from);
  const metaNums = [
    ...(edge ? [edge.toPartNum] : []),
    ...inbound.map((e) => e.fromPartNum),
  ];
  const meta = await loadPartMeta(metaNums);

  return {
    outbound: edge
      ? {
          ...edge,
          to: meta.get(edge.toPartNum) ?? {
            partNum: edge.toPartNum,
            name: edge.toPartNum,
            thumbUrl: null,
          },
        }
      : null,
    inbound: inbound.map((e) => ({
      ...e,
      from: meta.get(e.fromPartNum) ?? {
        partNum: e.fromPartNum,
        name: e.fromPartNum,
        thumbUrl: null,
      },
    })),
    latestPartNum,
  };
}

/** 沿 to 追到终点；遇环则停在当前节点 */
export async function resolveLatestPartNum(partNum: string): Promise<string> {
  let current = normalizePartNum(partNum);
  if (!current) return partNum.trim();

  const seen = new Set<string>();
  for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
    if (seen.has(current)) return current;
    seen.add(current);
    const edge = await getPartUpgradeEdge(current);
    if (!edge) return current;
    current = edge.toPartNum;
  }
  return current;
}

/** 若把 from→to，to 沿链路是否会回到 from（成环） */
async function wouldCreateCycle(
  fromPartNum: string,
  toPartNum: string
): Promise<boolean> {
  let current = toPartNum;
  const seen = new Set<string>([fromPartNum]);
  for (let i = 0; i < MAX_CHAIN_DEPTH; i++) {
    if (seen.has(current)) return true;
    seen.add(current);
    const edge = await getPartUpgradeEdge(current);
    if (!edge) return false;
    current = edge.toPartNum;
  }
  return true;
}

export async function setPartUpgrade(
  fromPartNum: string,
  toPartNum: string,
  note?: string | null
): Promise<PartUpgradeMutationResult> {
  const from = normalizePartNum(fromPartNum);
  const to = normalizePartNum(toPartNum);
  if (!from || !to) {
    return { ok: false, error: "零件号无效。" };
  }
  if (from === to) {
    return { ok: false, error: "不能将零件升级为自身。" };
  }

  const [fromExists, toExists] = await Promise.all([
    catalogPartExists(from),
    catalogPartExists(to),
  ]);
  if (!fromExists || !toExists) {
    return { ok: false, error: "目录中不存在该零件。" };
  }

  if (await wouldCreateCycle(from, to)) {
    return { ok: false, error: "会形成循环升级链，请调整目标零件。" };
  }

  const now = new Date().toISOString();
  const noteVal =
    typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;

  try {
    const db = getUserDb();
    await db
      .insert(buildPartUpgrades)
      .values({
        fromPartNum: from,
        toPartNum: to,
        note: noteVal,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: buildPartUpgrades.fromPartNum,
        set: {
          toPartNum: to,
          note: noteVal,
          updatedAt: now,
        },
      });
    return { ok: true };
  } catch {
    return { ok: false, error: "保存失败，请重试。" };
  }
}

export async function clearPartUpgrade(
  fromPartNum: string
): Promise<PartUpgradeMutationResult> {
  const from = normalizePartNum(fromPartNum);
  if (!from) {
    return { ok: false, error: "零件号无效。" };
  }
  try {
    const db = getUserDb();
    await db
      .delete(buildPartUpgrades)
      .where(eq(buildPartUpgrades.fromPartNum, from));
    return { ok: true };
  } catch {
    return { ok: false, error: "清除失败，请重试。" };
  }
}
