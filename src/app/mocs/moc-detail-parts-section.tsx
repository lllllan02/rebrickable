"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { saveMocPartsSheetToDb } from "@/app/mocs/moc-parts-sheet-actions";
import { MocDetailPartsListExportBar } from "@/app/mocs/moc-detail-parts-export";
import { PartsSheetImport } from "@/app/mocs/moc-parts-sheet-import";
import { MocPartsList } from "@/app/mocs/moc-parts-list";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type Props = {
  mocId: string;
  initialFull: InitialMocSheetFromServer | null;
  initialShortage: InitialMocSheetFromServer | null;
  initialMocLoadError: string | null;
};

export function MocDetailPartsSection({
  mocId,
  initialFull,
  initialShortage,
  initialMocLoadError,
}: Props) {
  const router = useRouter();
  const [listTab, setListTab] = useState<"full" | "shortage">(() => {
    if (initialFull) return "full";
    if (initialShortage) return "shortage";
    return "full";
  });

  useEffect(() => {
    if (listTab === "full" && !initialFull && initialShortage) setListTab("shortage");
    else if (listTab === "shortage" && !initialShortage && initialFull) setListTab("full");
  }, [initialFull, initialShortage, listTab]);

  const persistShortage = useCallback(
    async (items: ShortageResolveItem[], skippedHeader: boolean) => {
      const result = await saveMocPartsSheetToDb({
        mocId,
        kind: "shortage",
        skippedHeader,
        items,
        sourceFileName: null,
      });
      if (result.ok) router.refresh();
      return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
    },
    [mocId, router]
  );

  const hasAnySheet = Boolean(initialFull || initialShortage);

  return (
    <div id="moc-parts-sheet-tools" className="scroll-mt-24 border-t border-[var(--border-soft)] pt-8">
      <div className="section-panel space-y-5">
        <header className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--text)]">零件表</h2>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            与{" "}
            <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
              rebrickable_parts_*_缺货表.csv
            </code>{" "}
            相同结构。可分别上传完整零件表与缺件表；解析成功后写入本 MOC（两侧互不覆盖）。下方可切换查看；缺件表支持删除行或更换颜色。新 MOC 也可从{" "}
            <Link href="/mocs" className="text-[var(--accent)] underline">
              MOC 列表
            </Link>{" "}
            顶部上传导入（默认写入完整表）。
          </p>
        </header>

        <PartsSheetImport
          requestedLoadMocId={mocId}
          initialFullSheet={initialFull}
          initialShortageSheet={initialShortage}
          initialMocLoadError={initialMocLoadError}
          mocDetailEmbed
        />

        {hasAnySheet ? (
          <div className="border-t border-[var(--border-soft)] pt-5">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!initialFull}
                  title={!initialFull ? "尚未上传完整零件表" : undefined}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    listTab === "full"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                      : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                  } ${!initialFull ? "cursor-not-allowed opacity-45" : ""}`}
                  onClick={() => {
                    if (initialFull) setListTab("full");
                  }}
                >
                  完整零件表
                </button>
                <button
                  type="button"
                  disabled={!initialShortage}
                  title={!initialShortage ? "尚未上传缺件表" : undefined}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    listTab === "shortage"
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                      : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                  } ${!initialShortage ? "cursor-not-allowed opacity-45" : ""}`}
                  onClick={() => {
                    if (initialShortage) setListTab("shortage");
                  }}
                >
                  缺件表
                </button>
              </div>
              <MocDetailPartsListExportBar
                mocId={mocId}
                listTab={listTab}
                initialFull={initialFull}
                initialShortage={initialShortage}
              />
            </div>

            {listTab === "full" && initialFull ? (
              <MocPartsList
                items={initialFull.items}
                skippedHeader={initialFull.skippedHeader}
                savedAt={initialFull.savedAt}
                totalPartQty={undefined}
              />
            ) : null}
            {listTab === "shortage" && initialShortage ? (
              <MocPartsList
                items={initialShortage.items}
                skippedHeader={initialShortage.skippedHeader}
                savedAt={initialShortage.savedAt}
                totalPartQty={undefined}
                shortageEditable={{ onPersist: persistShortage }}
              />
            ) : null}

            {listTab === "full" && !initialFull ? (
              <p className="text-sm text-[var(--muted)]">
                尚未上传完整零件表，请使用上方「上传完整零件表 CSV」。
              </p>
            ) : null}
            {listTab === "shortage" && !initialShortage ? (
              <p className="text-sm text-[var(--muted)]">尚未上传缺件表，请使用上方「上传缺件表 CSV」。</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
