"use client";

import { PartsDraggableGrid } from "@/app/parts/parts-draggable-grid";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { formatCatalogBilingualColorLabel } from "@/lib/color-zh-names";
import { elementDomId } from "@/lib/dom-anchors";
import type {
  PurchaseElementPageRow,
  PurchasePartPageRow,
  PurchaseViewMode,
} from "@/lib/load-purchase-list";

function QtyBadge({ qty }: { qty: number }) {
  return (
    <span className="pointer-events-none absolute right-0.5 top-0.5 z-[2] rounded bg-[rgba(7,10,18,0.82)] px-1 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-[var(--text)] ring-1 ring-[var(--border)]">
      {qty.toLocaleString("zh-CN")}
    </span>
  );
}

function PendingDot() {
  return (
    <span
      className="pointer-events-none absolute left-1 top-1 z-[2] h-2 w-2 rounded-full bg-amber-300/90 ring-1 ring-[var(--border)]"
      title="待选色"
      aria-label="待选色"
    />
  );
}

export function PurchaseListTiles({
  view,
  partRows,
  elementRows,
  selectedIds,
  onToggleSelect,
  dragEnabled = false,
}: {
  view: PurchaseViewMode;
  partRows: PurchasePartPageRow[];
  elementRows: PurchaseElementPageRow[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  dragEnabled?: boolean;
}) {
  if (view === "part") {
    if (partRows.length === 0) {
      return (
        <p className="text-sm text-[var(--muted)]">当前分类下没有购买清单记录。</p>
      );
    }
    return (
      <PartsDraggableGrid enabled={dragEnabled}>
        {partRows.map((r) => {
          const title = [
            r.partNum,
            r.name,
            r.pendingColor ? "待选色" : `${r.totalQty} 粒`,
            r.isPrinted ? "印刷件" : "普通零件",
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={r.partNum}
              className="min-w-0"
              data-part-num={r.partNum}
            >
              <PartGridTileLink
                href={`/parts/${encodeURIComponent(r.partNum)}`}
                titleAttr={title}
                partNum={r.partNum}
                thumbUrl={r.thumbUrl}
                isPrinted={r.isPrinted}
                topRight={
                  <>
                    {r.pendingColor ? <PendingDot /> : null}
                    {r.totalQty > 0 ? <QtyBadge qty={r.totalQty} /> : null}
                  </>
                }
              >
                <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
                  {r.name}
                </p>
              </PartGridTileLink>
            </li>
          );
        })}
      </PartsDraggableGrid>
    );
  }

  if (elementRows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        暂无已选色的待购行。请到零件详情为颜色填写待购数量。
      </p>
    );
  }

  return (
    <ul className="tiles-grid" role="list">
      {elementRows.map((r) => {
        const colorLabel = formatCatalogBilingualColorLabel(
          r.colorId,
          r.colorName
        );
        const href = r.elementId
          ? `/parts/${encodeURIComponent(r.partNum)}#${elementDomId(r.elementId)}`
          : `/parts/${encodeURIComponent(r.partNum)}`;
        const title = [
          r.partNum,
          colorLabel,
          r.partName,
          `${r.quantity} 粒`,
          r.elementId,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <li key={r.id} className="relative min-w-0">
            <PartGridTileLink
              href={href}
              titleAttr={title}
              partNum={r.partNum}
              thumbUrl={r.thumbUrl}
              isPrinted={r.isPrinted}
              topRight={<QtyBadge qty={r.quantity} />}
            >
              <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
                <span
                  className="mr-1 inline-block h-2 w-2 shrink-0 rounded-sm align-middle ring-1 ring-[var(--border)]"
                  style={{ background: `#${r.rgb}` }}
                  aria-hidden
                />
                {colorLabel}
              </p>
            </PartGridTileLink>
            <label
              className="absolute left-0.5 top-0.5 z-[3] inline-flex"
              title="选中以转入零件库"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(r.id)}
                aria-label="选中以转入零件库"
                className="h-3.5 w-3.5 accent-[var(--accent)]"
                onChange={() => onToggleSelect(r.id)}
                onClick={(e) => e.stopPropagation()}
              />
            </label>
          </li>
        );
      })}
    </ul>
  );
}
