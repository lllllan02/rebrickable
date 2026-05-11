"use client";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { PartsSheetImport } from "@/app/mocs/moc-parts-sheet-import";

type Props = {
  requestedLoadMocId: string;
  initialMocSheet: InitialMocSheetFromServer | null;
  initialMocLoadError: string | null;
};

export function MocImportContent({
  requestedLoadMocId,
  initialMocSheet,
  initialMocLoadError,
}: Props) {
  return (
    <PartsSheetImport
      requestedLoadMocId={requestedLoadMocId}
      initialMocSheet={initialMocSheet}
      initialMocLoadError={initialMocLoadError}
      mocImportMode
    />
  );
}
