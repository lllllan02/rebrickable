import {
  formatBricktimePriceValue,
  formatGobricksMatchPercent,
  formatSetGoodPriceCny,
} from "@/lib/set-good-price-format";

export type SetGoodPriceReferencePreview = {
  officialPrice: string | null;
  lowestPrice: string | null;
  goodPrice: string | null;
  gobricksPriceCny: number | null;
  gobricksMatchPercent: number | null;
};

function ReferencePriceCell({
  label,
  value,
  subLabel,
  tone = "amber",
}: {
  label: string;
  value: string | null;
  subLabel?: string | null;
  tone?: "amber" | "sky";
}) {
  const valueClass = tone === "sky" ? "text-sky-100/95" : "text-amber-100/95";

  return (
    <div className="min-w-0">
      <p
        className={`font-mono text-sm font-semibold tabular-nums ${value ? valueClass : "text-[var(--muted-2)]"}`}
      >
        {value ?? "—"}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--muted)]">{label}</p>
      {subLabel ? (
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-[var(--muted-2)]">{subLabel}</p>
      ) : null}
    </div>
  );
}

export function SetGoodPriceReferencePanel({
  preview,
  bricktimeFetchedAt,
  gobricksComparedAt,
}: {
  preview: SetGoodPriceReferencePreview;
  bricktimeFetchedAt?: string | null;
  gobricksComparedAt?: string | null;
}) {
  const officialLabel = formatBricktimePriceValue(preview.officialPrice);
  const lowestLabel = formatBricktimePriceValue(preview.lowestPrice);
  const goodLabel = formatBricktimePriceValue(preview.goodPrice);
  const gobricksLabel = formatSetGoodPriceCny(preview.gobricksPriceCny);
  const matchLabel = formatGobricksMatchPercent(preview.gobricksMatchPercent);

  const hasAny =
    officialLabel != null ||
    lowestLabel != null ||
    goodLabel != null ||
    gobricksLabel != null;

  if (!hasAny) return null;

  const bricktimeHint =
    typeof bricktimeFetchedAt === "string" && bricktimeFetchedAt.trim()
      ? bricktimeFetchedAt.trim().slice(0, 19).replace("T", " ")
      : null;
  const gobricksHint =
    typeof gobricksComparedAt === "string" && gobricksComparedAt.trim()
      ? gobricksComparedAt.trim().slice(0, 19).replace("T", " ")
      : null;

  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/50 px-2.5 py-2 sm:px-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <ReferencePriceCell label="官方原价" value={officialLabel} />
        <ReferencePriceCell label="史低" value={lowestLabel} />
        <ReferencePriceCell label="超值入手" value={goodLabel} />
        <ReferencePriceCell
          label="高砖"
          value={gobricksLabel}
          subLabel={matchLabel ? `匹配 ${matchLabel}` : null}
          tone="sky"
        />
      </div>
      {bricktimeHint || gobricksHint ? (
        <p className="mt-1.5 text-[11px] tabular-nums text-[var(--muted-2)]">
          {bricktimeHint ? (
            <>
              官方价 <time dateTime={bricktimeFetchedAt!}>{bricktimeHint}</time>
            </>
          ) : null}
          {bricktimeHint && gobricksHint ? " · " : null}
          {gobricksHint ? (
            <>
              高砖 <time dateTime={gobricksComparedAt!}>{gobricksHint}</time>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
