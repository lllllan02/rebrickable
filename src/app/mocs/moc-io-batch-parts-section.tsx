"use client";

import type { InitialBuildSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { MocDetailPartsSection } from "@/app/mocs/moc-detail-parts-section";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

type Props = {
  mocId: string;
  batchId: number;
  batchLabel: string;
  initialFull: InitialBuildSheetFromServer | null;
  initialShortage: InitialBuildSheetFromServer | null;
  initialFulfillment: InitialBuildSheetFromServer | null;
  initialMocLoadError: string | null;
  initialShortageClearedAt: string | null;
  exportDisplayName: string;
};

/** 分步批次详情：复用 MOC 零件区 UI，持久化到 build_io_step_batches。 */
export function MocIoBatchPartsSection({
  mocId,
  batchId,
  batchLabel,
  initialFull,
  initialShortage,
  initialFulfillment,
  initialMocLoadError,
  initialShortageClearedAt,
  exportDisplayName,
}: Props) {
  return (
    <MocDetailPartsSection
      subjectKind={BUILD_SUBJECT_MOC}
      subjectId={mocId}
      ioBatchId={batchId}
      initialFull={initialFull}
      initialShortage={initialShortage}
      initialFulfillment={initialFulfillment}
      initialMocLoadError={initialMocLoadError}
      initialShortageClearedAt={initialShortageClearedAt}
      exportDisplayName={exportDisplayName || batchLabel}
    />
  );
}
