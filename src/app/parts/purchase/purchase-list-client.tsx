"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PurchaseListTiles } from "@/app/parts/purchase/purchase-list-tiles";
import { transferPurchaseListToOwnedAction } from "@/app/parts/purchase/purchase-list-actions";
import type {
  PurchaseElementPageRow,
  PurchasePartPageRow,
  PurchaseViewMode,
} from "@/lib/load-purchase-list";

export function PurchaseListClient({
  view,
  partRows,
  elementRows,
  dragEnabled = false,
}: {
  view: PurchaseViewMode;
  partRows: PurchasePartPageRow[];
  elementRows: PurchaseElementPageRow[];
  dragEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const transferableIds = useMemo(
    () => new Set(elementRows.map((r) => r.id)),
    [elementRows]
  );

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setError(null);
    setMessage(null);
  }

  function selectAllTransferable() {
    setSelectedIds(new Set(transferableIds));
    setError(null);
    setMessage(null);
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setError(null);
    setMessage(null);
  }

  function transfer() {
    const ids = [...selectedIds];
    if (ids.length === 0) {
      setError("请先勾选要转入的行。");
      return;
    }
    startTransition(async () => {
      const res = await transferPurchaseListToOwnedAction({ itemIds: ids });
      if (!res.ok) {
        setError(res.error);
        setMessage(null);
        return;
      }
      setSelectedIds(new Set());
      setError(null);
      setMessage(`已转入零件库 ${res.transferred} 行。`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {view === "element" && elementRows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-50"
            disabled={pending || transferableIds.size === 0}
            onClick={selectAllTransferable}
          >
            全选
          </button>
          <button
            type="button"
            className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50"
            disabled={pending || selectedIds.size === 0}
            onClick={clearSelection}
          >
            清除选择
          </button>
          <button
            type="button"
            className="button-primary rounded px-2.5 py-1 disabled:opacity-50"
            disabled={pending || selectedIds.size === 0}
            onClick={transfer}
          >
            转入零件库
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
          <span className="text-[var(--muted)]">
            元素列表只读；改数量请到零件详情。勾选后可批量转入零件库。
          </span>
        </div>
      ) : null}
      {view === "part" ? (
        <p className="text-xs text-[var(--muted)]">
          琥珀色圆点表示待选色。点进零件详情，在颜色旁填写待购数量后，才会出现在元素视图。
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-xs text-emerald-300/90" role="status">
          {message}
        </p>
      ) : null}
      <PurchaseListTiles
        view={view}
        partRows={partRows}
        elementRows={elementRows}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        dragEnabled={dragEnabled}
      />
    </div>
  );
}
