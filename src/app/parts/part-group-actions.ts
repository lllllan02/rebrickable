"use server";

import { and, asc, eq, max } from "drizzle-orm";

import { getUserDb } from "@/db/client";
import { buildPartGroupMembers, buildPartGroups } from "@/db/schema";
import { catalogPartExists } from "@/lib/load-favorite-parts";
import { loadPartGroupById } from "@/lib/part-groups";
import { PART_GROUP_NAME_MAX_LEN } from "@/lib/part-groups-shared";
import { revalidatePartGroupPaths } from "@/lib/part-groups-revalidate";

export type PartGroupActionResult =
  | { ok: true; groupId?: number }
  | { ok: false; error: string };

const MAX_PART_NUM_LEN = 64;

function normalizeGroupName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > PART_GROUP_NAME_MAX_LEN) return null;
  return name;
}

export async function createPartGroupAction(input: {
  name: string;
}): Promise<PartGroupActionResult> {
  const name = normalizeGroupName(input.name);
  if (!name) {
    return {
      ok: false,
      error: `分组名称无效（1–${PART_GROUP_NAME_MAX_LEN} 个字符）。`,
    };
  }

  try {
    const userDb = getUserDb();
    const [maxRow] = await userDb
      .select({ m: max(buildPartGroups.sortOrder) })
      .from(buildPartGroups);
    const sortOrder = (maxRow?.m ?? 0) + 1;
    const now = new Date().toISOString();
    const [inserted] = await userDb
      .insert(buildPartGroups)
      .values({
        name,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: buildPartGroups.id });

    revalidatePartGroupPaths();
    return { ok: true, groupId: inserted?.id };
  } catch {
    return { ok: false, error: "创建分组失败，请重试。" };
  }
}

export async function renamePartGroupAction(input: {
  groupId: number;
  name: string;
}): Promise<PartGroupActionResult> {
  const groupId = input.groupId;
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return { ok: false, error: "分组无效。" };
  }
  const name = normalizeGroupName(input.name);
  if (!name) {
    return {
      ok: false,
      error: `分组名称无效（1–${PART_GROUP_NAME_MAX_LEN} 个字符）。`,
    };
  }

  const existing = await loadPartGroupById(groupId);
  if (!existing) return { ok: false, error: "分组不存在。" };

  try {
    const userDb = getUserDb();
    await userDb
      .update(buildPartGroups)
      .set({ name, updatedAt: new Date().toISOString() })
      .where(eq(buildPartGroups.id, groupId));
    revalidatePartGroupPaths();
    return { ok: true, groupId };
  } catch {
    return { ok: false, error: "重命名失败，请重试。" };
  }
}

export async function deletePartGroupAction(input: {
  groupId: number;
}): Promise<PartGroupActionResult> {
  const groupId = input.groupId;
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return { ok: false, error: "分组无效。" };
  }

  const existing = await loadPartGroupById(groupId);
  if (!existing) return { ok: false, error: "分组不存在。" };

  try {
    const userDb = getUserDb();
    const members = await userDb
      .select({ partNum: buildPartGroupMembers.partNum })
      .from(buildPartGroupMembers)
      .where(eq(buildPartGroupMembers.groupId, groupId));

    await userDb
      .delete(buildPartGroupMembers)
      .where(eq(buildPartGroupMembers.groupId, groupId));
    await userDb
      .delete(buildPartGroups)
      .where(eq(buildPartGroups.id, groupId));

    revalidatePartGroupPaths(members.map((m) => m.partNum));
    return { ok: true };
  } catch {
    return { ok: false, error: "删除分组失败，请重试。" };
  }
}

/** 清除零件全部自定义分组归属（拖到「待分组」） */
export async function clearPartGroupMembershipsAction(input: {
  partNum: string;
}): Promise<PartGroupActionResult> {
  const partNum = input.partNum.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }

  const exists = await catalogPartExists(partNum);
  if (!exists) return { ok: false, error: "目录中不存在该零件。" };

  try {
    const userDb = getUserDb();
    await userDb
      .delete(buildPartGroupMembers)
      .where(eq(buildPartGroupMembers.partNum, partNum));
    revalidatePartGroupPaths([partNum]);
    return { ok: true };
  } catch {
    return { ok: false, error: "清除分组失败，请重试。" };
  }
}

export async function setPartGroupMembershipAction(input: {
  groupId: number;
  partNum: string;
  member: boolean;
}): Promise<PartGroupActionResult> {
  const groupId = input.groupId;
  const partNum = input.partNum.trim();
  if (!Number.isFinite(groupId) || groupId <= 0) {
    return { ok: false, error: "分组无效。" };
  }
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }

  const existing = await loadPartGroupById(groupId);
  if (!existing) return { ok: false, error: "分组不存在。" };

  const exists = await catalogPartExists(partNum);
  if (!exists) return { ok: false, error: "目录中不存在该零件。" };

  try {
    const userDb = getUserDb();
    if (input.member) {
      const addedAt = new Date().toISOString();
      await userDb
        .insert(buildPartGroupMembers)
        .values({ groupId, partNum, addedAt })
        .onConflictDoNothing();
      await userDb
        .update(buildPartGroups)
        .set({ updatedAt: addedAt })
        .where(eq(buildPartGroups.id, groupId));
    } else {
      await userDb
        .delete(buildPartGroupMembers)
        .where(
          and(
            eq(buildPartGroupMembers.groupId, groupId),
            eq(buildPartGroupMembers.partNum, partNum)
          )
        );
      await userDb
        .update(buildPartGroups)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(buildPartGroups.id, groupId));
    }
    revalidatePartGroupPaths([partNum]);
    return { ok: true, groupId };
  } catch {
    return { ok: false, error: "更新分组失败，请重试。" };
  }
}

/** 供归属控件：全部分组 + 当前零件已加入的组 */
export async function loadPartGroupAssignStateAction(input: {
  partNum: string;
}): Promise<
  | {
      ok: true;
      groups: { id: number; name: string; member: boolean }[];
    }
  | { ok: false; error: string }
> {
  const partNum = input.partNum.trim();
  if (!partNum || partNum.length > MAX_PART_NUM_LEN) {
    return { ok: false, error: "零件号无效。" };
  }

  try {
    const userDb = getUserDb();
    const groups = await userDb
      .select({
        id: buildPartGroups.id,
        name: buildPartGroups.name,
      })
      .from(buildPartGroups)
      .orderBy(asc(buildPartGroups.sortOrder), asc(buildPartGroups.id));

    const memberRows = await userDb
      .select({ groupId: buildPartGroupMembers.groupId })
      .from(buildPartGroupMembers)
      .where(eq(buildPartGroupMembers.partNum, partNum));
    const memberIds = new Set(memberRows.map((r) => r.groupId));

    return {
      ok: true,
      groups: groups.map((g) => ({
        id: g.id,
        name: g.name,
        member: memberIds.has(g.id),
      })),
    };
  } catch {
    return { ok: false, error: "加载分组失败。" };
  }
}
