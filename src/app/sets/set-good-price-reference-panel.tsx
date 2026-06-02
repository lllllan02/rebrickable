import {
  formatBricktimePriceValue,
  formatDiscountVsOfficialPrice,
  formatGobricksMatchPercent,
  formatSetGoodPriceCny,
} from "@/lib/set-good-price-format";
import type { BricktimePriceHistoryPoint } from "@/lib/bricktime-price-history";

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
  discountLabel,
  subLabel,
  tone = "amber",
}: {
  label: string;
  value: string | null;
  discountLabel?: string | null;
  subLabel?: string | null;
  tone?: "amber" | "sky";
}) {
  const valueClass = tone === "sky" ? "text-sky-100/95" : "text-amber-100/95";

  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${value ? valueClass : "text-[var(--muted-2)]"}`}
        >
          {value ?? "—"}
        </span>
        {value && discountLabel ? (
          <span className="shrink-0 font-mono text-[11px] font-medium tabular-nums text-emerald-400/90">
            {discountLabel}
          </span>
        ) : null}
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
  priceHistory,
  onViewPriceHistory,
}: {
  preview: SetGoodPriceReferencePreview;
  priceHistory?: readonly BricktimePriceHistoryPoint[] | null;
  onViewPriceHistory?: () => void;
}) {
  const officialLabel = formatBricktimePriceValue(preview.officialPrice);
  const lowestLabel = formatBricktimePriceValue(preview.lowestPrice);
  const goodLabel = formatBricktimePriceValue(preview.goodPrice);
  const gobricksLabel = formatSetGoodPriceCny(preview.gobricksPriceCny);
  const matchLabel = formatGobricksMatchPercent(preview.gobricksMatchPercent);

  const lowestDiscount = formatDiscountVsOfficialPrice(preview.lowestPrice, preview.officialPrice);
  const goodDiscount = formatDiscountVsOfficialPrice(preview.goodPrice, preview.officialPrice);
  const gobricksDiscount = formatDiscountVsOfficialPrice(
    preview.gobricksPriceCny,
    preview.officialPrice
  );

  const hasAny =
    officialLabel != null ||
    lowestLabel != null ||
    goodLabel != null ||
    gobricksLabel != null;

  const hasHistory = (priceHistory?.length ?? 0) > 0;

  if (!hasAny) return null;

  return (
    <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/50 px-2.5 py-2 sm:px-3">
      {hasHistory && onViewPriceHistory ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onViewPriceHistory}
            className="text-[11px] text-[var(--accent)] underline-offset-2 hover:underline"
            title="查看 Bricktime 电商价格历史曲线"
          >
            价格曲线
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <ReferencePriceCell label="官方原价" value={officialLabel} />
        <ReferencePriceCell
          label="史低"
          value={lowestLabel}
          discountLabel={lowestDiscount}
        />
        <ReferencePriceCell
          label="超值入手"
          value={goodLabel}
          discountLabel={goodDiscount}
        />
        <ReferencePriceCell
          label="高砖"
          value={gobricksLabel}
          discountLabel={gobricksDiscount}
          subLabel={matchLabel ? `匹配 ${matchLabel}` : null}
          tone="sky"
        />
      </div>
    </div>
  );
}
