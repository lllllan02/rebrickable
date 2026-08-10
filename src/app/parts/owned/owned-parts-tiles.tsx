import { OwnedElementQtyInput } from "@/app/parts/owned-element-qty-input";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { elementDomId } from "@/lib/dom-anchors";
import type {
  OwnedElementPageRow,
  OwnedPartPageRow,
  OwnedViewMode,
} from "@/lib/load-owned-parts";

function QtyBadge({ qty }: { qty: number }) {
  return (
    <span className="pointer-events-none absolute right-0.5 top-0.5 z-[2] rounded bg-[rgba(7,10,18,0.82)] px-1 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-[var(--text)] ring-1 ring-[var(--border)]">
      {qty.toLocaleString("zh-CN")}
    </span>
  );
}

export function OwnedPartsTiles({
  view,
  partRows,
  elementRows,
}: {
  view: OwnedViewMode;
  partRows: OwnedPartPageRow[];
  elementRows: OwnedElementPageRow[];
}) {
  if (view === "part") {
    if (partRows.length === 0) {
      return (
        <p className="text-sm text-[var(--muted)]">当前分类下没有零件库记录。</p>
      );
    }
    return (
      <ul className="tiles-grid" role="list">
        {partRows.map((r) => {
          const title = [
            r.partNum,
            r.name,
            `${r.totalQty} 粒`,
            r.isPrinted ? "印刷件" : "普通零件",
          ].join(" · ");
          return (
            <li key={r.partNum} className="min-w-0">
              <PartGridTileLink
                href={`/parts/${encodeURIComponent(r.partNum)}`}
                titleAttr={title}
                partNum={r.partNum}
                thumbUrl={r.thumbUrl}
                isPrinted={r.isPrinted}
                topRight={<QtyBadge qty={r.totalQty} />}
              >
                <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
                  {r.name}
                </p>
              </PartGridTileLink>
            </li>
          );
        })}
      </ul>
    );
  }

  if (elementRows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">当前分类下没有元素库存记录。</p>
    );
  }

  return (
    <ul className="tiles-grid" role="list">
      {elementRows.map((r) => {
        const label = r.elementId ?? `${r.partNum}/${r.colorId}`;
        const href = r.elementId
          ? `/parts/${encodeURIComponent(r.partNum)}#${elementDomId(r.elementId)}`
          : `/parts/${encodeURIComponent(r.partNum)}`;
        const title = [
          label,
          r.colorName,
          r.partNum,
          r.partName,
          `${r.quantity} 粒`,
        ].join(" · ");
        return (
          <li
            key={`${r.partNum}-${r.colorId}-${r.elementId ?? "x"}`}
            className="relative min-w-0"
          >
            <PartGridTileLink
              href={href}
              titleAttr={title}
              partNum={label}
              thumbUrl={r.thumbUrl}
              isPrinted={r.isPrinted}
            >
              <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
                <span
                  className="mr-1 inline-block h-2 w-2 shrink-0 rounded-sm align-middle ring-1 ring-[var(--border)]"
                  style={{ background: `#${r.rgb}` }}
                  aria-hidden
                />
                {r.colorName}
              </p>
            </PartGridTileLink>
            {/* 放在 Link 外，避免点击输入框触发详情跳转 */}
            <div className="absolute right-0.5 top-0.5 z-[3]">
              <OwnedElementQtyInput
                partNum={r.partNum}
                colorId={r.colorId}
                initialQuantity={r.quantity}
                compact
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
