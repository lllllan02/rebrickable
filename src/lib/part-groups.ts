import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildPartGroupMembers, buildPartGroups } from "@/db/schema";
import {
  parsePartGroupFilter,
  type PartGroupFilter,
  type PartGroupNavRow,
} from "@/lib/part-groups-shared";

export type {
  PartGroupFilter,
  PartGroupNavRow,
  PartsNavMode,
} from "@/lib/part-groups-shared";
export {
  PART_GROUP_NAME_MAX_LEN,
  parsePartGroupFilter,
  parsePartsNavMode,
  partGroupFilterQueryValue,
} from "@/lib/part-groups-shared";

export type PartGroupRow = {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/** @deprecated 使用 parsePartGroupFilter */
export function parsePartGroupParam(raw: string | undefined): number | null {
  const f = parsePartGroupFilter(raw);
  return typeof f === "number" ? f : null;
}

export async function loadPartGroups(): Promise<PartGroupRow[]> {
  const userDb = getUserDb();
  return userDb
    .select({
      id: buildPartGroups.id,
      name: buildPartGroups.name,
      sortOrder: buildPartGroups.sortOrder,
      createdAt: buildPartGroups.createdAt,
      updatedAt: buildPartGroups.updatedAt,
    })
    .from(buildPartGroups)
    .orderBy(asc(buildPartGroups.sortOrder), asc(buildPartGroups.id));
}

export async function loadPartGroupById(
  groupId: number
): Promise<PartGroupRow | null> {
  const userDb = getUserDb();
  const [row] = await userDb
    .select({
      id: buildPartGroups.id,
      name: buildPartGroups.name,
      sortOrder: buildPartGroups.sortOrder,
      createdAt: buildPartGroups.createdAt,
      updatedAt: buildPartGroups.updatedAt,
    })
    .from(buildPartGroups)
    .where(eq(buildPartGroups.id, groupId))
    .limit(1);
  return row ?? null;
}

export async function loadPartNumsInGroup(
  groupId: number
): Promise<Set<string>> {
  const userDb = getUserDb();
  const rows = await userDb
    .select({ partNum: buildPartGroupMembers.partNum })
    .from(buildPartGroupMembers)
    .where(eq(buildPartGroupMembers.groupId, groupId));
  return new Set(rows.map((r) => r.partNum));
}

/** 任意自定义组中出现过的零件号 */
export async function loadAllGroupedPartNums(): Promise<Set<string>> {
  const userDb = getUserDb();
  const rows = await userDb
    .selectDistinct({ partNum: buildPartGroupMembers.partNum })
    .from(buildPartGroupMembers);
  return new Set(rows.map((r) => r.partNum));
}

export type GroupPartNumConstraint =
  | { kind: "none" }
  | { kind: "include"; partNums: Set<string> }
  | { kind: "exclude"; partNums: Set<string> };

export async function resolveGroupPartNumConstraint(
  filter: PartGroupFilter
): Promise<GroupPartNumConstraint> {
  if (filter === "all") return { kind: "none" };
  if (filter === "ungrouped") {
    const grouped = await loadAllGroupedPartNums();
    return { kind: "exclude", partNums: grouped };
  }
  const members = await loadPartNumsInGroup(filter);
  return { kind: "include", partNums: members };
}

export async function isPartGroupFilterValid(
  filter: PartGroupFilter
): Promise<boolean> {
  if (filter === "all" || filter === "ungrouped") return true;
  const row = await loadPartGroupById(filter);
  return row != null;
}

export async function loadGroupIdsForPart(
  partNum: string
): Promise<number[]> {
  const trimmed = partNum.trim();
  if (!trimmed) return [];
  const userDb = getUserDb();
  const rows = await userDb
    .select({ groupId: buildPartGroupMembers.groupId })
    .from(buildPartGroupMembers)
    .where(eq(buildPartGroupMembers.partNum, trimmed));
  return rows.map((r) => r.groupId);
}

export async function loadGroupIdsByPartNums(
  partNums: readonly string[]
): Promise<Map<string, number[]>> {
  const unique = [...new Set(partNums.map((p) => p.trim()).filter(Boolean))];
  const map = new Map<string, number[]>();
  if (unique.length === 0) return map;

  const userDb = getUserDb();
  const rows = await userDb
    .select({
      partNum: buildPartGroupMembers.partNum,
      groupId: buildPartGroupMembers.groupId,
    })
    .from(buildPartGroupMembers)
    .where(inArray(buildPartGroupMembers.partNum, unique));

  for (const r of rows) {
    const list = map.get(r.partNum) ?? [];
    list.push(r.groupId);
    map.set(r.partNum, list);
  }
  return map;
}

export type PartGroupNavSummary = {
  totalInScope: number;
  ungroupedCount: number;
  groups: PartGroupNavRow[];
};

export async function loadPartGroupNavSummary(
  scopePartNums: readonly string[] | null,
  catalogTotal?: number
): Promise<PartGroupNavSummary> {
  const groups = await loadPartGroups();
  const userDb = getUserDb();

  if (scopePartNums === null) {
    const totalInScope = catalogTotal ?? 0;
    const countRows =
      groups.length === 0
        ? []
        : await userDb
            .select({
              groupId: buildPartGroupMembers.groupId,
              c: sql<number>`count(*)`.mapWith(Number),
            })
            .from(buildPartGroupMembers)
            .groupBy(buildPartGroupMembers.groupId);
    const countById = new Map(countRows.map((r) => [r.groupId, r.c]));
    const [groupedDistinct] = await userDb
      .select({
        c: sql<number>`count(distinct ${buildPartGroupMembers.partNum})`.mapWith(
          Number
        ),
      })
      .from(buildPartGroupMembers);
    const groupedCount = Number(groupedDistinct?.c ?? 0);
    return {
      totalInScope,
      ungroupedCount: Math.max(0, totalInScope - groupedCount),
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        count: countById.get(g.id) ?? 0,
      })),
    };
  }

  const scopeSet = new Set(scopePartNums.map((p) => p.trim()).filter(Boolean));
  const totalInScope = scopeSet.size;
  if (totalInScope === 0) {
    return {
      totalInScope: 0,
      ungroupedCount: 0,
      groups: groups.map((g) => ({ id: g.id, name: g.name, count: 0 })),
    };
  }

  const memberRows =
    groups.length === 0
      ? []
      : await userDb
          .select({
            groupId: buildPartGroupMembers.groupId,
            partNum: buildPartGroupMembers.partNum,
          })
          .from(buildPartGroupMembers)
          .where(
            and(
              inArray(
                buildPartGroupMembers.groupId,
                groups.map((g) => g.id)
              ),
              inArray(buildPartGroupMembers.partNum, [...scopeSet])
            )
          );

  const countById = new Map<number, number>();
  const groupedInScope = new Set<string>();
  for (const r of memberRows) {
    if (!scopeSet.has(r.partNum)) continue;
    groupedInScope.add(r.partNum);
    countById.set(r.groupId, (countById.get(r.groupId) ?? 0) + 1);
  }

  return {
    totalInScope,
    ungroupedCount: totalInScope - groupedInScope.size,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      count: countById.get(g.id) ?? 0,
    })),
  };
}

export async function loadPartGroupNavRows(
  scopePartNums: readonly string[] | null
): Promise<PartGroupNavRow[]> {
  const summary = await loadPartGroupNavSummary(scopePartNums);
  return summary.groups;
}

export function filterRowsByGroupConstraint<T extends { partNum: string }>(
  rows: readonly T[],
  constraint: GroupPartNumConstraint
): T[] {
  if (constraint.kind === "none") return [...rows];
  if (constraint.kind === "include") {
    if (constraint.partNums.size === 0) return [];
    return rows.filter((r) => constraint.partNums.has(r.partNum));
  }
  return rows.filter((r) => !constraint.partNums.has(r.partNum));
}

export function filterRowsByGroupMembership<T extends { partNum: string }>(
  rows: readonly T[],
  groupPartNums: Set<string> | null
): T[] {
  if (groupPartNums == null) return [...rows];
  return rows.filter((r) => groupPartNums.has(r.partNum));
}
