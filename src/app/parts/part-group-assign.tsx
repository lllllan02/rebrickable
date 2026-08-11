"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createPartGroupAction,
  loadPartGroupAssignStateAction,
  setPartGroupMembershipAction,
} from "@/app/parts/part-group-actions";
import { PART_GROUP_NAME_MAX_LEN } from "@/lib/part-groups-shared";

type GroupState = { id: number; name: string; member: boolean };

type Props = {
  partNum: string;
  /** 初始已加入的分组 id（SSR 传入，避免首屏闪烁） */
  initialGroupIds?: readonly number[];
  className?: string;
};

/** 零件详情用：文字入口打开复选弹层（列表归组请用拖拽） */
export function PartGroupAssign({
  partNum,
  initialGroupIds = [],
  className = "",
}: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [groups, setGroups] = useState<GroupState[]>(() =>
    initialGroupIds.map((id) => ({ id, name: "", member: true }))
  );
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const memberCount = groups.filter((g) => g.member).length;
  const hasMembership = memberCount > 0 || initialGroupIds.length > 0;

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

  const initialKey = [...initialGroupIds].sort((a, b) => a - b).join(",");
  useEffect(() => {
    setLoaded(false);
    setOpen(false);
    setGroups(
      initialKey
        ? initialKey.split(",").map((id) => ({
            id: Number(id),
            name: "",
            member: true,
          }))
        : []
    );
  }, [partNum, initialKey]);

  const toggleMember = (groupId: number, next: boolean) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, member: next } : g))
    );
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
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={pending && !open}
        className="text-xs text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-50"
        onClick={() => setOpen((v) => !v)}
      >
        {hasMembership
          ? `编辑分组${memberCount > 0 ? ` (${memberCount})` : ""}`
          : "编辑分组"}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="编辑自定义分组归属"
          className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-lg"
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
                      onChange={(e) => toggleMember(g.id, e.target.checked)}
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
