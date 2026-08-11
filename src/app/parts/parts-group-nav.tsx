"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  clearPartGroupMembershipsAction,
  createPartGroupAction,
  deletePartGroupAction,
  renamePartGroupAction,
  setPartGroupMembershipAction,
} from "@/app/parts/part-group-actions";
import { PART_GROUP_DND_MIME } from "@/lib/part-group-dnd";
import {
  PART_GROUP_NAME_MAX_LEN,
  type PartGroupFilter,
} from "@/lib/part-groups-shared";

export type PartsGroupNavItem = {
  id: number;
  name: string;
  count: number;
  href: string;
};

function DropNavRow({
  href,
  label,
  count,
  active,
  dropKind,
  onRename,
  onDelete,
  onDropPart,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  dropKind: "none" | "ungrouped" | "group";
  onRename?: () => void;
  onDelete?: () => void;
  onDropPart?: (partNum: string) => void;
}) {
  const [over, setOver] = useState(false);
  const acceptsDrop = dropKind !== "none" && onDropPart != null;

  return (
    <div
      className={`flex items-center gap-1 rounded-md text-xs transition-colors ${
        over && acceptsDrop
          ? "bg-[var(--accent)]/20 ring-1 ring-[var(--accent)]"
          : active
            ? "bg-[var(--accent-soft)]"
            : "hover:bg-[var(--surface-3)]"
      }`}
      onDragEnter={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              setOver(true);
            }
          : undefined
      }
      onDragOver={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setOver(true);
            }
          : undefined
      }
      onDragLeave={
        acceptsDrop
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOver(false);
              }
            }
          : undefined
      }
      onDrop={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              setOver(false);
              const partNum =
                e.dataTransfer.getData(PART_GROUP_DND_MIME) ||
                e.dataTransfer.getData("text/plain");
              if (partNum.trim()) onDropPart(partNum.trim());
            }
          : undefined
      }
    >
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 transition-colors ${
          active ? "font-medium text-[var(--text)]" : "text-[var(--text)]"
        }`}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 tabular-nums text-[var(--muted)]">
          {count.toLocaleString("zh-CN")}
        </span>
      </Link>
      {onRename || onDelete ? (
        <div className="flex shrink-0 items-center gap-0.5 pr-1">
          {onRename ? (
            <button
              type="button"
              title="重命名"
              aria-label={`重命名分组 ${label}`}
              className="rounded px-1 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
              onClick={onRename}
            >
              改
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              title="删除"
              aria-label={`删除分组 ${label}`}
              className="rounded px-1 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger,#c44)]"
              onClick={onDelete}
            >
              删
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PartsGroupNav({
  groups,
  activeFilter,
  hrefAll,
  hrefUngrouped,
  totalInScope,
  ungroupedCount,
}: {
  groups: PartsGroupNavItem[];
  activeFilter: PartGroupFilter;
  hrefAll: string;
  hrefUngrouped: string;
  totalInScope: number;
  ungroupedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const submitCreate = () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await createPartGroupAction({ name });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewName("");
      router.refresh();
    });
  };

  const submitRename = (groupId: number) => {
    const name = editName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const res = await renamePartGroupAction({ groupId, name });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  };

  const submitDelete = (groupId: number, label: string) => {
    if (!window.confirm(`确定删除分组「${label}」？组内零件归属将一并清除。`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deletePartGroupAction({ groupId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (activeFilter === groupId) {
        router.push(hrefAll);
        return;
      }
      router.refresh();
    });
  };

  const dropOntoGroup = (groupId: number, partNum: string) => {
    setError(null);
    startTransition(async () => {
      const res = await setPartGroupMembershipAction({
        groupId,
        partNum,
        member: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const dropOntoUngrouped = (partNum: string) => {
    setError(null);
    startTransition(async () => {
      const res = await clearPartGroupMembershipsAction({ partNum });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <nav
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-label="按自定义分组筛选零件"
    >
      <h2 className="text-xs font-semibold text-[var(--text)]">自定义分组</h2>
      <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
        将零件拖到下方分组或「待分组」即可调整归属
      </p>
      <div className="mt-2 max-h-[min(20rem,40vh)] space-y-0.5 overflow-y-auto pr-0.5">
        <DropNavRow
          href={hrefAll}
          label="全部"
          count={totalInScope}
          active={activeFilter === "all"}
          dropKind="none"
        />
        <DropNavRow
          href={hrefUngrouped}
          label="待分组"
          count={ungroupedCount}
          active={activeFilter === "ungrouped"}
          dropKind="ungrouped"
          onDropPart={dropOntoUngrouped}
        />
        {groups.map((g) =>
          editingId === g.id ? (
            <form
              key={g.id}
              className="flex items-center gap-1 px-1 py-0.5"
              onSubmit={(e) => {
                e.preventDefault();
                submitRename(g.id);
              }}
            >
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={PART_GROUP_NAME_MAX_LEN}
                className="field min-w-0 flex-1 text-xs"
                aria-label="新分组名称"
                autoFocus
                disabled={pending}
              />
              <button
                type="submit"
                disabled={pending || !editName.trim()}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                disabled={pending}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--muted)] hover:bg-[var(--surface-3)]"
                onClick={() => setEditingId(null)}
              >
                取消
              </button>
            </form>
          ) : (
            <DropNavRow
              key={g.id}
              href={g.href}
              label={g.name}
              count={g.count}
              active={activeFilter === g.id}
              dropKind="group"
              onDropPart={(partNum) => dropOntoGroup(g.id, partNum)}
              onRename={() => {
                setEditingId(g.id);
                setEditName(g.name);
                setError(null);
              }}
              onDelete={() => submitDelete(g.id, g.name)}
            />
          )
        )}
      </div>

      <form
        className="mt-2 flex flex-col gap-1.5 border-t border-[var(--border)] pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitCreate();
        }}
      >
        <label className="sr-only" htmlFor="parts-group-new-name">
          新建分组名称
        </label>
        <input
          id="parts-group-new-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={PART_GROUP_NAME_MAX_LEN}
          placeholder="新建分组…"
          className="field w-full text-xs"
          disabled={pending}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={pending || !newName.trim()}
          className="button-primary w-full text-xs disabled:opacity-50"
        >
          新建分组
        </button>
        {error ? (
          <p className="text-[11px] text-[var(--danger,#c44)]" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </nav>
  );
}
