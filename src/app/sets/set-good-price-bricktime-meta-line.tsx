import { Fragment, type ReactNode } from "react";

import {
  buildBricktimeMetaDisplayItems,
  type BricktimeSetMetaFields,
} from "@/lib/set-good-price-format";

function MetaDot() {
  return (
    <span className="text-[var(--muted-2)]" aria-hidden>
      ·
    </span>
  );
}

export function SetGoodPriceBricktimeMetaLine({
  meta,
}: {
  meta: Partial<BricktimeSetMetaFields> | null | undefined;
}) {
  const items = buildBricktimeMetaDisplayItems(meta);
  if (items.length === 0) return null;

  const nodes: ReactNode[] = items.map((item) => (
    <span key={item.label} className="text-[var(--muted)]">
      <span className="text-[var(--muted-2)]">{item.label}</span>{" "}
      <span className="tabular-nums text-[var(--text)]/90">{item.value}</span>
    </span>
  ));

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-xs">
      {nodes.map((node, i) => (
        <Fragment key={i}>
          {i > 0 ? <MetaDot /> : null}
          {node}
        </Fragment>
      ))}
    </p>
  );
}
