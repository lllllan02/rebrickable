"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";

import { MocPartsList } from "@/app/mocs/moc-parts-list";
import {
  saveManualSplitPlan,
  type ManualSplitPlanLoaded,
} from "@/app/mocs/manual-split-actions";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import {
  aggregateByLineKey,
  manualSplitLineKey,
  moveOneUnit,
  nextManualBagClientKey,
  nextManualBagLabel,
  recomputeRemainder,
  totalPartQty,
  type ManualSplitBagState,
} from "@/lib/manual-split";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type ViewTarget =
  | { kind: "remainder" }
  | { kind: "manual"; clientKey: string };

/** 点选零件的去向：剩余池，或某个手动包 */
type ReceiveTarget =
  | { kind: "remainder" }
  | { kind: "bag"; clientKey: string };

type Props = {
  plan: ManualSplitPlanLoaded;
};

const navBtn =
  "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors";
const navBtnActive =
  "border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--text)]";
const navBtnIdle =
  "border-transparent text-[var(--muted)] hover:border-[var(--border-soft)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]";

function ManualBagNavItem({
  bag,
  isView,
  isReceive,
  canDelete,
  onSelect,
  onRename,
  onDelete,
}: {
  bag: ManualSplitBagState;
  isView: boolean;
  isReceive: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onRename: (label: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bag.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isView && editing) {
      setEditing(false);
      setDraft(bag.label);
    }
  }, [isView, editing, bag.label]);

  useEffect(() => {
    if (!editing) setDraft(bag.label);
  }, [bag.label, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = useCallback(() => {
    const next = draft.trim() || bag.label.trim() || "分包";
    onRename(next);
    setDraft(next);
    setEditing(false);
  }, [bag.label, draft, onRename]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDraft(bag.label);
        setEditing(false);
      }
    },
    [bag.label, commit]
  );

  if (editing) {
    return (
      <div className="relative min-w-[8rem] sm:min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          aria-label="分包名称"
          className={`${navBtn} ${navBtnActive} py-2.5 text-[var(--text)] outline-none`}
        />
      </div>
    );
  }

  return (
    <div className="relative min-w-[8rem] sm:min-w-0">
      <button
        type="button"
        className={`${navBtn} ${isView ? navBtnActive : navBtnIdle} ${canDelete ? "pr-8" : ""}`}
        onClick={onSelect}
        onDoubleClick={() => {
          onSelect();
          setDraft(bag.label);
          setEditing(true);
        }}
        title={isReceive ? "当前接收包 · 双击重命名" : "双击重命名"}
      >
        <span className="block truncate">
          {bag.label}
          {isReceive ? (
            <span className="ml-1 text-[10px] text-[var(--accent)]">接收</span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--muted-2)]">
          {totalPartQty(bag.items)} 片
        </span>
      </button>
      {canDelete ? (
        <button
          type="button"
          className="absolute right-1 top-1 rounded p-1 text-[var(--muted-2)] hover:bg-red-950/40 hover:text-red-200/95"
          aria-label={`删除「${bag.label}」`}
          title="删除分包"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function ManualSplitWorkspace({ plan }: Props) {
  const router = useRouter();
  const detailHref = buildSubjectDetailPath(plan.subjectKind, plan.subjectId);

  const [planName, setPlanName] = useState(plan.name);
  const [manualBags, setManualBags] = useState<ManualSplitBagState[]>(() =>
    plan.manualBags.map((b) => ({ ...b, items: [...b.items] }))
  );
  const [remainderItems, setRemainderItems] = useState<ShortageResolveItem[]>(() => [
    ...plan.remainder.items,
  ]);
  /** 在「剩余」视图下选中的接收分包 */
  const [bagReceiveKey, setBagReceiveKey] = useState(
    () => plan.manualBags[0]?.clientKey ?? "bag-1"
  );
  const [view, setView] = useState<ViewTarget>({ kind: "remainder" });
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remainder: ManualSplitBagState = useMemo(
    () => ({
      clientKey: "remainder",
      dbId: plan.remainder.dbId,
      label: "剩余",
      isRemainder: true,
      items: remainderItems,
    }),
    [plan.remainder.dbId, remainderItems]
  );

  const bagReceive =
    manualBags.find((b) => b.clientKey === bagReceiveKey) ?? manualBags[0] ?? null;

  /** 剩余池：接收为所选分包；分包内编辑：用 ± 与剩余调拨 */
  const receive: ReceiveTarget =
    view.kind === "remainder"
      ? { kind: "bag", clientKey: bagReceive?.clientKey ?? bagReceiveKey }
      : { kind: "remainder" };

  const receiveLabel =
    receive.kind === "remainder"
      ? "剩余"
      : (manualBags.find((b) => b.clientKey === receive.clientKey)?.label ?? "分包");

  const viewedBag: ManualSplitBagState = useMemo(() => {
    if (view.kind === "remainder") return remainder;
    return manualBags.find((b) => b.clientKey === view.clientKey) ?? remainder;
  }, [view, manualBags, remainder]);

  const remainderByKey = useMemo(
    () => aggregateByLineKey(remainderItems),
    [remainderItems]
  );

  const canIncrementFromRemainder = useCallback(
    (item: ShortageResolveItem) => {
      const key = manualSplitLineKey(item);
      if (!key) return false;
      const row = remainderByKey.get(key);
      return Boolean(row && Math.trunc(row.quantity) > 0);
    },
    [remainderByKey]
  );

  const onAdjustBagUnit = useCallback(
    (item: ShortageResolveItem, delta: 1 | -1) => {
      if (view.kind !== "manual") return;
      const key = manualSplitLineKey(item);
      if (!key) return;
      const bagKey = view.clientKey;
      const bag = manualBags.find((b) => b.clientKey === bagKey);
      if (!bag) return;
      setSavedHint(null);
      setError(null);

      if (delta === 1) {
        const moved = moveOneUnit({
          from: remainderItems,
          to: bag.items,
          lineKey: key,
        });
        if (!moved.moved) return;
        setRemainderItems(moved.from);
        setManualBags((prev) =>
          prev.map((b) => (b.clientKey === bagKey ? { ...b, items: moved.to } : b))
        );
        return;
      }

      const moved = moveOneUnit({
        from: bag.items,
        to: remainderItems,
        lineKey: key,
      });
      if (!moved.moved) return;
      setManualBags((prev) =>
        prev.map((b) => (b.clientKey === bagKey ? { ...b, items: moved.from } : b))
      );
      setRemainderItems(moved.to);
    },
    [view, manualBags, remainderItems]
  );

  const onPickUnit = useCallback(
    (item: ShortageResolveItem) => {
      const key = manualSplitLineKey(item);
      if (!key) return;
      setSavedHint(null);
      setError(null);

      const fromItems =
        view.kind === "remainder"
          ? remainderItems
          : (manualBags.find((b) => b.clientKey === view.clientKey)?.items ?? null);
      if (!fromItems) return;

      // 源与目标相同则无操作
      if (view.kind === "remainder" && receive.kind === "remainder") return;
      if (
        view.kind === "manual" &&
        receive.kind === "bag" &&
        view.clientKey === receive.clientKey
      ) {
        return;
      }

      if (receive.kind === "remainder") {
        const moved = moveOneUnit({
          from: fromItems,
          to: remainderItems,
          lineKey: key,
        });
        if (!moved.moved) return;
        if (view.kind === "manual") {
          setManualBags((prev) =>
            prev.map((b) =>
              b.clientKey === view.clientKey ? { ...b, items: moved.from } : b
            )
          );
        }
        setRemainderItems(moved.to);
        return;
      }

      const toBag = manualBags.find((b) => b.clientKey === receive.clientKey);
      if (!toBag) return;

      if (view.kind === "remainder") {
        const moved = moveOneUnit({
          from: remainderItems,
          to: toBag.items,
          lineKey: key,
        });
        if (!moved.moved) return;
        setRemainderItems(moved.from);
        setManualBags((prev) =>
          prev.map((b) =>
            b.clientKey === receive.clientKey ? { ...b, items: moved.to } : b
          )
        );
        return;
      }

      const moved = moveOneUnit({
        from: fromItems,
        to: toBag.items,
        lineKey: key,
      });
      if (!moved.moved) return;
      setManualBags((prev) =>
        prev.map((b) => {
          if (b.clientKey === view.clientKey) return { ...b, items: moved.from };
          if (b.clientKey === receive.clientKey) return { ...b, items: moved.to };
          return b;
        })
      );
    },
    [receive, view, remainderItems, manualBags]
  );

  const addBag = useCallback(() => {
    setSavedHint(null);
    const clientKey = nextManualBagClientKey(manualBags);
    const label = nextManualBagLabel(manualBags);
    const next: ManualSplitBagState = {
      clientKey,
      label,
      isRemainder: false,
      items: [],
    };
    setManualBags((prev) => [...prev, next]);
    setBagReceiveKey(clientKey);
    setView({ kind: "manual", clientKey });
  }, [manualBags]);

  const selectBag = useCallback((bag: ManualSplitBagState) => {
    if (bag.isRemainder) {
      setView({ kind: "remainder" });
      return;
    }
    setView({ kind: "manual", clientKey: bag.clientKey });
  }, []);

  const renameBag = useCallback((clientKey: string, label: string) => {
    setSavedHint(null);
    setManualBags((prev) =>
      prev.map((b) => (b.clientKey === clientKey ? { ...b, label } : b))
    );
  }, []);

  const deleteBag = useCallback(
    (clientKey: string) => {
      setSavedHint(null);
      setError(null);
      if (manualBags.length <= 1) {
        setError("至少保留一个分包。");
        return;
      }
      if (!manualBags.some((b) => b.clientKey === clientKey)) return;

      const next = manualBags.filter((b) => b.clientKey !== clientKey);
      const fallback = next[0]!;
      setManualBags(next);
      setRemainderItems(recomputeRemainder(plan.source.items, next));
      setBagReceiveKey((cur) => (cur === clientKey ? fallback.clientKey : cur));
      setView((cur) =>
        cur.kind === "manual" && cur.clientKey === clientKey
          ? { kind: "manual", clientKey: fallback.clientKey }
          : cur
      );
    },
    [manualBags, plan.source.items]
  );

  const onSave = useCallback(() => {
    setError(null);
    setSavedHint(null);
    startTransition(async () => {
      const r = await saveManualSplitPlan({
        planId: plan.planId,
        name: planName,
        bags: [
          ...manualBags.map((b) => ({
            clientKey: b.clientKey,
            dbId: b.dbId,
            label: b.label,
            isRemainder: false,
            items: b.items,
          })),
          {
            clientKey: "remainder",
            dbId: remainder.dbId,
            label: "剩余",
            isRemainder: true,
            items: remainderItems,
          },
        ],
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedHint("已保存");
      router.refresh();
    });
  }, [plan.planId, planName, manualBags, remainder.dbId, remainderItems, router]);

  const sourceMeta = `源：${plan.sourceKind === "official" ? "官方清单" : "完整零件表"} · ${totalPartQty(plan.source.items)} 片`;

  const listHint =
    view.kind === "remainder"
      ? `点击零件移入「${receiveLabel}」· 悬停看摘要 · 详情`
      : "− / + 与剩余调拨 · 悬停看摘要 · 详情";

  return (
    <div className="page-stack">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-[var(--muted)]">
              <Link href={detailHref} className="text-[var(--accent)] underline">
                返回详情
              </Link>
              <span className="mx-1.5 text-[var(--muted-2)]">·</span>
              手动分包
            </p>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full max-w-md rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-base font-semibold text-[var(--text)] outline-none focus:border-[var(--accent)]"
              aria-label="方案名称"
            />
            <p className="text-xs text-[var(--muted)]">{sourceMeta}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {savedHint ? (
              <span className="text-xs text-emerald-200/95">{savedHint}</span>
            ) : null}
            <button
              type="button"
              className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--text)] disabled:opacity-45"
              disabled={pending}
              onClick={onSave}
            >
              {pending ? "保存中…" : "保存方案"}
            </button>
          </div>
        </div>
        {error ? <p className="text-sm text-red-200/95">{error}</p> : null}
        <p className="text-sm text-[var(--muted)]">
          {listHint}
          <span className="text-[var(--muted-2)]"> · 双击包名重命名</span>
        </p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <nav
          className="flex shrink-0 flex-row gap-1 overflow-x-auto sm:w-40 sm:flex-col sm:overflow-visible sm:border-r sm:border-[var(--border-soft)] sm:pr-3"
          aria-label="分包列表"
        >
          {manualBags.map((bag) => {
            const isView =
              view.kind === "manual" && view.clientKey === bag.clientKey;
            const isReceive =
              receive.kind === "bag" && receive.clientKey === bag.clientKey;
            return (
              <ManualBagNavItem
                key={bag.clientKey}
                bag={bag}
                isView={isView}
                isReceive={isReceive}
                canDelete={manualBags.length > 1}
                onSelect={() => selectBag(bag)}
                onRename={(label) => renameBag(bag.clientKey, label)}
                onDelete={() => deleteBag(bag.clientKey)}
              />
            );
          })}
          <button
            type="button"
            className={`${navBtn} ${navBtnIdle} text-center sm:text-left`}
            onClick={addBag}
            title="新增分包"
          >
            + 新包
          </button>
          <button
            type="button"
            className={`${navBtn} ${view.kind === "remainder" ? navBtnActive : navBtnIdle}`}
            onClick={() => selectBag(remainder)}
          >
            <span className="block truncate">
              剩余
              {receive.kind === "remainder" ? (
                <span className="ml-1 text-[10px] text-[var(--accent)]">接收</span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--muted-2)]">
              {totalPartQty(remainderItems)} 片
            </span>
          </button>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-[var(--text)]">
              {viewedBag.label}
              <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                {totalPartQty(viewedBag.items)} 片 · {viewedBag.items.length} 行
              </span>
            </h2>
            {view.kind === "remainder" ? (
              <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                <span className="shrink-0">接收</span>
                {manualBags.length > 1 ? (
                  <select
                    value={bagReceive?.clientKey ?? bagReceiveKey}
                    onChange={(e) => {
                      setSavedHint(null);
                      setBagReceiveKey(e.target.value);
                    }}
                    aria-label="选择接收分包"
                    className="max-w-[10rem] rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-1 text-xs font-medium text-[var(--text)] outline-none focus:border-[var(--accent)]"
                  >
                    {manualBags.map((b) => (
                      <option key={b.clientKey} value={b.clientKey}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="font-medium text-[var(--text)]">
                    {bagReceive?.label ?? "分包"}
                  </span>
                )}
              </label>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                与<strong className="mx-0.5 font-medium text-[var(--text)]">剩余</strong>调拨
              </p>
            )}
          </div>
          {viewedBag.items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              {view.kind === "remainder" ? "剩余池已空。" : "此包尚无零件，可在「剩余」中点选移入。"}
            </p>
          ) : view.kind === "remainder" ? (
            <MocPartsList
              items={viewedBag.items}
              skippedHeader={plan.source.skippedHeader}
              savedAt={plan.updatedAt}
              sourceMetaLine={listHint}
              pickMode
              onPickUnit={onPickUnit}
            />
          ) : (
            <MocPartsList
              items={viewedBag.items}
              skippedHeader={plan.source.skippedHeader}
              savedAt={plan.updatedAt}
              sourceMetaLine={listHint}
              qtyAdjustMode
              canIncrementUnit={canIncrementFromRemainder}
              onAdjustUnit={onAdjustBagUnit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
