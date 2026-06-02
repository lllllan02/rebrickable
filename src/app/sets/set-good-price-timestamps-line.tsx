import { Fragment } from "react";

export type SetGoodPriceTimestampsInput = {
  priceUpdatedAt?: string | null;
  bricktimeFetchedAt?: string | null;
  gobricksComparedAt?: string | null;
};

type TimestampEntry = { label: string; iso: string; display: string };

function parseTimestampEntry(
  label: string,
  iso: string | null | undefined
): TimestampEntry | null {
  const s = iso?.trim();
  if (!s || Number.isNaN(Date.parse(s))) return null;
  return { label, iso: s, display: s.slice(0, 19).replace("T", " ") };
}

export function buildSetGoodPriceTimestampEntries(
  input: SetGoodPriceTimestampsInput
): TimestampEntry[] {
  const entries: TimestampEntry[] = [];
  const price = parseTimestampEntry("好价", input.priceUpdatedAt);
  const bricktime = parseTimestampEntry("官方价", input.bricktimeFetchedAt);
  const gobricks = parseTimestampEntry("高砖", input.gobricksComparedAt);
  if (price) entries.push(price);
  if (bricktime) entries.push(bricktime);
  if (gobricks) entries.push(gobricks);
  return entries;
}

export function SetGoodPriceTimestampsLine({
  priceUpdatedAt,
  bricktimeFetchedAt,
  gobricksComparedAt,
  className = "text-[11px] tabular-nums text-[var(--muted-2)]",
}: SetGoodPriceTimestampsInput & { className?: string }) {
  const entries = buildSetGoodPriceTimestampEntries({
    priceUpdatedAt,
    bricktimeFetchedAt,
    gobricksComparedAt,
  });
  if (entries.length === 0) return null;

  return (
    <p className={className}>
      {entries.map((entry, i) => (
        <Fragment key={entry.label}>
          {i > 0 ? " · " : null}
          {entry.label} <time dateTime={entry.iso}>{entry.display}</time>
        </Fragment>
      ))}
    </p>
  );
}
