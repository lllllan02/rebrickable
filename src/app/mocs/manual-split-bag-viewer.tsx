"use client";

import { useEffect, useState } from "react";

import { loadManualSplitBagItems } from "@/app/mocs/manual-split-actions";
import { MocPartsList } from "@/app/mocs/moc-parts-list";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type Props = {
  bagId: number;
};

export function ManualSplitBagViewer({ bagId }: Props) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "error"; error: string }
    | { status: "ok"; items: ShortageResolveItem[]; skippedHeader: boolean; label: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      const r = await loadManualSplitBagItems(bagId);
      if (cancelled) return;
      if (!r.ok) {
        setState({ status: "error", error: r.error });
        return;
      }
      setState({
        status: "ok",
        items: r.items,
        skippedHeader: r.skippedHeader,
        label: r.label,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [bagId]);

  if (state.status === "loading") {
    return <p className="text-sm text-[var(--muted)]">加载分包零件…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-red-200/95">{state.error}</p>;
  }
  if (state.items.length === 0) {
    return <p className="text-sm text-[var(--muted)]">此包暂无零件。</p>;
  }
  return (
    <MocPartsList
      items={state.items}
      skippedHeader={state.skippedHeader}
      savedAt="2000-01-01T00:00:00.000Z"
      sourceMetaLine={`手动分包 · ${state.label}`}
    />
  );
}
