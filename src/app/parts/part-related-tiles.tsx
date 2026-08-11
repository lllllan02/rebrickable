import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { loadUpgradeTargetsForParts } from "@/lib/part-upgrades";

export type PartRelatedTile = {
  partNum: string;
  name: string;
  relType: string;
  thumbUrl: string | null;
};

/** 印刷件：关系类型 P，或编号中含 pr / pat（不区分大小写） */
function isPrintedRelatedPart(item: PartRelatedTile): boolean {
  if (item.relType === "P") return true;
  return /pr|pat/i.test(item.partNum);
}

function RelatedTilesGrid({
  items,
  upgradeMap,
}: {
  items: PartRelatedTile[];
  upgradeMap: Map<string, string>;
}) {
  return (
    <ul className="tiles-grid" role="list">
      {items.map((r) => (
        <li key={`${r.relType}-${r.partNum}`} className="min-w-0">
          <PartGridTileLink
            href={`/parts/${encodeURIComponent(r.partNum)}`}
            titleAttr={`${r.partNum} · ${r.name} · ${r.relType}`}
            partNum={r.partNum}
            thumbUrl={r.thumbUrl}
            isPrinted={isPrintedRelatedPart(r)}
            upgradeToPartNum={upgradeMap.get(r.partNum)}
            topRight={
              <span className="pointer-events-none absolute right-1 top-1 z-[1] rounded bg-black/55 px-1 text-[9px] font-semibold leading-none text-[var(--muted)]">
                {r.relType}
              </span>
            }
          >
            <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted)]">
              {r.name}
            </p>
          </PartGridTileLink>
        </li>
      ))}
    </ul>
  );
}

export async function PartRelatedTiles({
  items,
  emptyLabel = "无",
}: {
  items: PartRelatedTile[];
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>;
  }

  const upgradeMap = await loadUpgradeTargetsForParts(
    items.map((r) => r.partNum)
  );

  const primary: PartRelatedTile[] = [];
  const printed: PartRelatedTile[] = [];
  for (const r of items) {
    if (isPrintedRelatedPart(r)) printed.push(r);
    else primary.push(r);
  }

  return (
    <div className="space-y-2">
      {primary.length > 0 ? (
        <RelatedTilesGrid items={primary} upgradeMap={upgradeMap} />
      ) : null}
      {printed.length > 0 ? (
        <details className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/60 px-2.5 py-2">
          <summary className="cursor-pointer select-none text-xs text-[var(--muted)]">
            印刷件等（{printed.length}）
          </summary>
          <div className="mt-2">
            <RelatedTilesGrid items={printed} upgradeMap={upgradeMap} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
