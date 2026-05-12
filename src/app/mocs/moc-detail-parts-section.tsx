"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { saveBuildPartsSheetToDb } from "@/app/mocs/moc-parts-sheet-actions";
import { MocDetailPartsListExportBar } from "@/app/mocs/moc-detail-parts-export";
import { PartsSheetImport } from "@/app/mocs/moc-parts-sheet-import";
import { MocPartsList } from "@/app/mocs/moc-parts-list";
import { buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type ListTab = "full" | "shortage" | "official";

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  initialFull: InitialMocSheetFromServer | null;
  initialShortage: InitialMocSheetFromServer | null;
  initialMocLoadError: string | null;
  /** 套装：官方 `inventory_parts` 列表（已转为与缺货表相同的行结构） */
  officialInventory?: {
    items: ShortageResolveItem[];
    inventoryId: number;
    version: number;
  } | null;
  /** 当前 MOC/套装主体已在「我的拥有」中标记 */
  parentSubjectOwned?: boolean;
};

export function MocDetailPartsSection({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  initialFull,
  initialShortage,
  initialMocLoadError,
  officialInventory = null,
  parentSubjectOwned = false,
}: Props) {
  const ui = buildSubjectUi(subjectKind);
  const listHref = buildSubjectListPath(subjectKind);
  const router = useRouter();
  const isSetSubject = subjectKind === BUILD_SUBJECT_SET;
  const hasOfficialRows = Boolean(officialInventory && officialInventory.items.length > 0);
  const hasOfficial = hasOfficialRows;

  const [listTab, setListTab] = useState<ListTab>(() => {
    if (isSetSubject) return "official";
    if (initialFull) return "full";
    if (initialShortage) return "shortage";
    if (hasOfficial) return "official";
    return "full";
  });

  useEffect(() => {
    if (isSetSubject) {
      if (listTab === "full") setListTab("official");
      else if (listTab === "shortage" && !initialShortage) setListTab("official");
      return;
    }
    if (listTab === "full" && !initialFull) {
      if (initialShortage) setListTab("shortage");
      else if (hasOfficial) setListTab("official");
    } else if (listTab === "shortage" && !initialShortage) {
      if (initialFull) setListTab("full");
      else if (hasOfficial) setListTab("official");
    } else if (listTab === "official" && !hasOfficial) {
      if (initialFull) setListTab("full");
      else if (initialShortage) setListTab("shortage");
    }
  }, [hasOfficial, initialFull, initialShortage, isSetSubject, listTab]);

  const persistShortage = useCallback(
    async (items: ShortageResolveItem[], skippedHeader: boolean) => {
      const result = await saveBuildPartsSheetToDb({
        subjectKind,
        subjectId,
        kind: "shortage",
        skippedHeader,
        items,
        sourceFileName: null,
      });
      if (result.ok) router.refresh();
      return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
    },
    [router, subjectId, subjectKind]
  );

  const hasAnySheet = Boolean(initialFull || initialShortage);
  const hasListArea = isSetSubject
    ? officialInventory != null || Boolean(initialShortage)
    : hasAnySheet || hasOfficial;

  const officialMetaLine =
    officialInventory != null
      ? `Rebrickable 本地库存 · inventory_id ${officialInventory.inventoryId} · 版本 v${officialInventory.version}`
      : "";

  return (
    <div id="moc-parts-sheet-tools" className="scroll-mt-24 border-t border-[var(--border-soft)] pt-8">
      <div className="section-panel space-y-5">
        <header className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--text)]">零件表</h2>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            {isSetSubject ? (
              <>
                完整清单来自本地已导入的 Rebrickable 官方库存（
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                  inventory_parts
                </code>
                ），不支持上传完整零件表 CSV。缺件表可与{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                  rebrickable_parts_*_缺货表.csv
                </code>{" "}
                相同结构单独上传，解析后写入本套装；可在「缺件表」Tab 编辑。已保存的缺件表会出现在{" "}
                <Link href={listHref} className="text-[var(--accent)] underline">
                  套装列表
                </Link>{" "}
                的「已存零件表」区域。
              </>
            ) : (
              <>
                与{" "}
                <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                  rebrickable_parts_*_缺货表.csv
                </code>{" "}
                相同结构。可分别上传完整零件表与缺件表；解析成功后写入本 {ui.noun}（两侧互不覆盖）。下方可切换查看；缺件表支持删除行或更换颜色。新记录也可从{" "}
                <Link href={listHref} className="text-[var(--accent)] underline">
                  {ui.noun} 列表
                </Link>{" "}
                顶部上传导入（默认写入完整表）。
                {hasOfficial ? (
                  <>
                    {" "}
                    「官方清单」与 CSV 使用同一套列表与筛选界面，数据来自本地已导入的{" "}
                    <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                      inventories
                    </code>
                    /
                    <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                      inventory_parts
                    </code>
                    ，与 CSV 写入的 SQLite 行并存、互不覆盖。
                  </>
                ) : null}
              </>
            )}
          </p>
        </header>

        <PartsSheetImport
          buildSubjectKind={subjectKind}
          requestedLoadMocId={subjectId}
          initialFullSheet={isSetSubject ? null : initialFull}
          initialShortageSheet={initialShortage}
          initialMocLoadError={initialMocLoadError}
          mocDetailEmbed
        />

        {hasListArea ? (
          <div className="border-t border-[var(--border-soft)] pt-5">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex flex-wrap gap-2">
                {isSetSubject ? (
                  <>
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        listTab === "official"
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                      }`}
                      onClick={() => setListTab("official")}
                    >
                      官方清单
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
                  </>
                ) : (
                  <>
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
                    {hasOfficial ? (
                      <button
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          listTab === "official"
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                            : "border-[var(--border-soft)] text-[var(--muted)] hover:border-[var(--accent)]/35 hover:bg-[var(--surface-2)]"
                        }`}
                        onClick={() => setListTab("official")}
                      >
                        官方清单
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              {listTab === "full" || listTab === "shortage" ? (
                <MocDetailPartsListExportBar
                  subjectKind={subjectKind}
                  subjectId={subjectId}
                  listTab={listTab}
                  initialFull={initialFull}
                  initialShortage={initialShortage}
                />
              ) : null}
            </div>

            {listTab === "full" && initialFull ? (
              <MocPartsList
                items={initialFull.items}
                skippedHeader={initialFull.skippedHeader}
                savedAt={initialFull.savedAt}
                totalPartQty={undefined}
                parentSubjectOwned={parentSubjectOwned}
              />
            ) : null}
            {listTab === "shortage" && initialShortage ? (
              <MocPartsList
                items={initialShortage.items}
                skippedHeader={initialShortage.skippedHeader}
                savedAt={initialShortage.savedAt}
                totalPartQty={undefined}
                shortageEditable={{ onPersist: persistShortage }}
                parentSubjectOwned={parentSubjectOwned}
              />
            ) : null}
            {listTab === "official" && officialInventory ? (
              hasOfficialRows ? (
                <MocPartsList
                  items={officialInventory.items}
                  skippedHeader={false}
                  savedAt="2000-01-01T00:00:00.000Z"
                  sourceMetaLine={officialMetaLine}
                  totalPartQty={undefined}
                  parentSubjectOwned={parentSubjectOwned}
                />
              ) : (
                <p className="text-sm text-[var(--muted)]">本地库存中暂无该套装的零件行。</p>
              )
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
