import { PartGridTileLink } from "@/components/part-grid-tile-link";
import type { OwnedPartCardDto } from "@/lib/owned-part-card-dto";
import { ownedPartCardKey } from "@/lib/owned-part-card-dto";

export function OwnedPartCard({ card }: { card: OwnedPartCardDto }) {
  const title = [
    card.partNum,
    card.name,
    card.colorName,
    card.isPrinted ? "印刷件" : null,
    `×${card.quantity}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="min-w-0">
      <PartGridTileLink
        href={`/parts/${encodeURIComponent(card.partNum)}`}
        titleAttr={title}
        partNum={card.partNum}
        thumbUrl={card.thumb}
        isPrinted={card.isPrinted}
        topRight={
          <span
            className="pointer-events-none absolute right-1 top-1 z-[2] rounded border border-white/15 bg-black/70 px-1 py-px text-[10px] font-semibold tabular-nums leading-none text-white shadow-sm"
            aria-label={`拥有数量 ${card.quantity}`}
          >
            {card.quantity.toLocaleString("zh-CN")}
          </span>
        }
      >
        <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
          {card.colorName}
        </p>
      </PartGridTileLink>
    </li>
  );
}

export function ownedPartCardListKey(card: OwnedPartCardDto): string {
  return ownedPartCardKey(card.partNum, card.colorId);
}
