import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { loadUpgradeTargetsForParts } from "@/lib/part-upgrades";

export type PartRelatedTile = {
  partNum: string;
  name: string;
  relType: string;
  thumbUrl: string | null;
};

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

  return (
    <ul className="tiles-grid" role="list">
      {items.map((r) => (
        <li key={`${r.relType}-${r.partNum}`} className="min-w-0">
          <PartGridTileLink
            href={`/parts/${encodeURIComponent(r.partNum)}`}
            titleAttr={`${r.partNum} · ${r.name} · ${r.relType}`}
            partNum={r.partNum}
            thumbUrl={r.thumbUrl}
            isPrinted={r.relType === "P"}
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
