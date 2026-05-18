import Link from "next/link";

import { loadIoBatchPartsSheetFromDb } from "@/app/mocs/io-batch-parts-sheet-actions";
import { MocIoBatchPartsSection } from "@/app/mocs/moc-io-batch-parts-section";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { fulfillmentItemsForDisplay } from "@/lib/sheet-row-replaced-marker";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ mocId: string; batchId: string }>;
};

export default async function MocIoBatchPage({ params }: Props) {
  const { mocId: rawMoc, batchId: rawBatch } = await params;
  const mocId = decodeURIComponent(rawMoc);
  const batchId = Number.parseInt(rawBatch, 10);

  if (!Number.isFinite(batchId) || batchId < 1) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-red-200/95">批次 ID 无效。</p>
      </main>
    );
  }

  const sheet = await loadIoBatchPartsSheetFromDb(batchId);
  const mocHref = buildSubjectDetailPath(BUILD_SUBJECT_MOC, mocId);

  if (!sheet.ok) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-red-200/95">{sheet.error}</p>
        <Link href={mocHref} className="mt-4 inline-block text-sm text-[var(--accent)] underline">
          返回 MOC
        </Link>
      </main>
    );
  }

  if (sheet.parentMocId && sheet.parentMocId !== mocId) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-red-200/95">批次与 MOC 不匹配。</p>
        <Link href={mocHref} className="mt-4 inline-block text-sm text-[var(--accent)] underline">
          返回 MOC
        </Link>
      </main>
    );
  }

  const batchLabel = sheet.batchLabel ?? `批次 ${batchId}`;

  let initialFull = null;
  let initialShortage = null;
  let initialFulfillment = null;
  let initialMocLoadError: string | null = null;

  if (sheet.full) {
    initialFull = {
      subjectId: mocId,
      skippedHeader: sheet.full.skippedHeader,
      items: sheet.full.items,
      savedAt: sheet.full.savedAt,
    };
  }
  if (sheet.shortage) {
    initialShortage = {
      subjectId: mocId,
      skippedHeader: sheet.shortage.skippedHeader,
      items: sheet.shortage.items,
      savedAt: sheet.shortage.savedAt,
    };
  }
  if (sheet.fulfillment) {
    initialFulfillment = {
      subjectId: mocId,
      skippedHeader: sheet.fulfillment.skippedHeader,
      items: fulfillmentItemsForDisplay(sheet.fulfillment.items),
      savedAt: sheet.fulfillment.savedAt,
    };
  }
  if (!initialFull && !initialShortage && !initialFulfillment) {
    initialMocLoadError = "该批次尚无零件表数据。";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <Link href={mocHref} className="text-sm text-[var(--accent)] underline underline-offset-2">
          ← MOC {mocId}
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-[var(--text)]">{batchLabel}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Studio .io 分步零件表 · 支持完整 / 缺件 / 配货视图</p>
      </div>

      <MocIoBatchPartsSection
        mocId={mocId}
        batchId={batchId}
        batchLabel={batchLabel}
        initialFull={initialFull}
        initialShortage={initialShortage}
        initialFulfillment={initialFulfillment}
        initialMocLoadError={initialMocLoadError}
        initialShortageClearedAt={sheet.shortageClearedAt}
        exportDisplayName={`${mocId}-${batchLabel}`}
      />
    </main>
  );
}
