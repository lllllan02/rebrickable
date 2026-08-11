"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createPartGroupAction,
  loadPartGroupAssignStateAction,
  setPartGroupMembershipAction,
} from "@/app/parts/part-group-actions";
import {
  PART_GROUP_NAME_MAX_LEN,
  partGroupFilterQueryValue,
} from "@/lib/part-groups-shared";

export type PartGroupAssignItem = { id: number; name: string };

type GroupState = { id: number; name: string; member: boolean };

type Props = {
  partNum: string;
  /** 初始已加入的分组（含名称，SSR 传入） */
  initialGroups?: readonly PartGroupAssignItem[];
  className?: string;
};

function groupCatalogHref(groupId: number): string {
  const u = new URLSearchParams();
  u.set("by", "group");
  u.set("group", partGroupFilterQueryValue(groupId));
  return `/parts?${u.toString()}`;
}

/** 零件详情用：分组信息行（名称+删除）与加号弹层 */
export function PartGroupAssign({
  partNum,
  initialGroups = [],
  className = "",
}: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [groups, setGroups] = useState<GroupState[]>(() =>
    initialGroups.map((g) => ({ id: g.id, name: g.name, member: true }))
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const memberGroups = groups.filter((g) => g.member && g.name);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const t = e.target;
      if (t instanceof Node && !root.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    startTransition(async () => {
      const res = await loadPartGroupAssignStateAction({ partNum });
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setGroups(res.groups);
      setLoaded(true);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, partNum]);

  useEffect(() => {
    setLoaded(false);
    setOpen(false);
    setGroups(
      initialGroups.map((g) => ({ id: g.id, name: g.name, member: true }))
    );
  }, [partNum, initialGroups]);

  const setMembership = (groupId: number, next: boolean) => {
    setGroups((prev) => {
      const exists = prev.some((g) => g.id === groupId);
      if (!exists) {
        return next
          ? [...prev, { id: groupId, name: "", member: true }]
          : prev;
      }
      return prev.map((g) => (g.id === groupId ? { ...g, member: next } : g));
    });
    setError(null);
    startTransition(async () => {
      const res = await setPartGroupMembershipAction({
        groupId,
        partNum,
        member: next,
      });
      if (!res.ok) {
        setGroups((prev) =>
          prev.map((g) => (g.id === groupId ? { ...g, member: !next } : g))
        );
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const createAndJoin = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const created = await createPartGroupAction({ name });
      if (!created.ok || created.groupId == null) {
        setError(created.ok ? "创建失败。" : created.error);
        return;
      }
      const join = await setPartGroupMembershipAction({
        groupId: created.groupId,
        partNum,
        member: true,
      });
      if (!join.ok) {
        setError(join.error);
        return;
      }
      setNewName("");
      setLoaded(false);
      const res = await loadPartGroupAssignStateAction({ partNum });
      if (res.ok) {
        setGroups(res.groups);
        setLoaded(true);
      }
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} className={`relative ${className}`.trim()}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <span className="shrink-0 text-[var(--text)]">分组：</span>
        {memberGroups.map((g) => (
          <span
            key={g.id}
            className="badge inline-flex max-w-full items-center gap-0.5 py-0.5 pl-1.5 pr-0.5 text-xs"
          >
            <Link
              href={groupCatalogHref(g.id)}
              className="min-w-0 truncate no-underline hover:text-[var(--accent)]"
              title={`查看分组「${g.name}」`}
            >
              {g.name}
            </Link>
            <button
              type="button"
              disabled={pending}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] disabled:opacity-50"
              aria-label={`移出分组「${g.name}」`}
              title="移出分组"
              onClick={() => setMembership(g.id, false)}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label="加入分组"
          title="加入分组"
          disabled={pending && !open}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-base leading-none text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
          onClick={() => setOpen((v) => !v)}
        >
          +
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="加入自定义分组"
          className="absolute left-0 right-0 z-30 mt-1 w-full min-w-[14rem] max-w-xs rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-lg sm:left-auto sm:right-0 sm:w-56"
        >
          {!loaded && pending ? (
            <p className="px-1 py-2 text-xs text-[var(--muted)]">加载中…</p>
          ) : groups.length === 0 ? (
            <p className="px-1 py-1.5 text-xs text-[var(--muted)]">
              暂无分组，可在下方新建。
            </p>
          ) : (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto">
              {groups.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-[var(--surface-3)]">
                    <input
                      type="checkbox"
                      checked={g.member}
                      disabled={pending || !g.name}
                      onChange={(e) => setMembership(g.id, e.target.checked)}
                      className="accent-[var(--accent)]"
                    />
                    <span className="min-w-0 truncate">
                      {g.name || `分组 ${g.id}`}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-1.5 flex gap-1 border-t border-[var(--border)] pt-1.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={PART_GROUP_NAME_MAX_LEN}
              placeholder="新建并加入…"
              className="field min-w-0 flex-1 text-xs"
              disabled={pending}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createAndJoin();
                }
              }}
            />
            <button
              type="button"
              disabled={pending || !newName.trim()}
              className="shrink-0 rounded-md border border-[var(--border)] px-2 text-xs text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
              onClick={createAndJoin}
            >
              加
            </button>
          </div>
          {error ? (
            <p className="mt-1 text-[11px] text-[var(--danger,#c44)]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
