import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";

import { listIoSplitPlanGroupsForMoc } from "@/app/mocs/io-batch-parts-sheet-actions";
import type { InitialBuildSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { loadMocPartsSheetFromDb } from "@/app/mocs/moc-parts-sheet-actions";
import { MocDetailPartsSection } from "@/app/mocs/moc-detail-parts-section";
import { getUserDb } from "@/db/client";
import { buildAttachments, buildImages, buildProfiles } from "@/db/schema";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildAttachmentPublicPath } from "@/lib/build-attachment-public-path";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { BuildWorkflowProgressPanel } from "@/app/build/build-workflow-progress-panel";
import { ensureWorkflowCollected } from "@/lib/ensure-workflow-collected";
import { parseTagsJson } from "@/lib/moc-profile-parse";
import { fulfillmentItemsForDisplay } from "@/lib/sheet-row-replaced-marker";

import { MocDetailEditorial } from "../moc-detail-editorial";
import type { MocAttachmentRow } from "../moc-attachments-panel";
import type { MocGalleryImage } from "../moc-image-carousel";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ mocId: string }> };

export default async function MocDetailPage({ params }: Props) {
  const { mocId: raw } = await params;
  const mocId = decodeURIComponent(raw);

  const db = getUserDb();
  const mocKey = and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), eq(buildImages.subjectId, mocId));
  const mocAttKey = and(
    eq(buildAttachments.subjectKind, BUILD_SUBJECT_MOC),
    eq(buildAttachments.subjectId, mocId)
  );
  const mocProfKey = and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), eq(buildProfiles.subjectId, mocId));
  const [imgRows, attRows, sheet, profileRow, ioSplitPlans, workflowProgress] = await Promise.all([
    db
      .select({
        id: buildImages.id,
        storedFile: buildImages.storedFile,
        originalName: buildImages.originalName,
        createdAt: buildImages.createdAt,
      })
      .from(buildImages)
      .where(mocKey)
      .orderBy(asc(buildImages.createdAt), asc(buildImages.id)),
    db
      .select({
        id: buildAttachments.id,
        storedFile: buildAttachments.storedFile,
        originalName: buildAttachments.originalName,
        byteSize: buildAttachments.byteSize,
        createdAt: buildAttachments.createdAt,
      })
      .from(buildAttachments)
      .where(mocAttKey)
      .orderBy(asc(buildAttachments.createdAt), asc(buildAttachments.id)),
    loadMocPartsSheetFromDb(mocId),
    db.select().from(buildProfiles).where(mocProfKey).limit(1),
    listIoSplitPlanGroupsForMoc(mocId),
    ensureWorkflowCollected(BUILD_SUBJECT_MOC, mocId),
  ]);

  const profile = profileRow[0];
  const initialDisplayName = (profile?.displayName ?? "").trim();
  const initialTags = parseTagsJson(profile?.tagsJson);

  const galleryImages: MocGalleryImage[] = imgRows.map((r) => ({
    id: r.id,
    url: buildImagePublicPath(BUILD_SUBJECT_MOC, mocId, r.storedFile),
    originalName: r.originalName,
    createdAt: r.createdAt,
  }));

  const attachmentRows: MocAttachmentRow[] = attRows.map((r) => ({
    id: r.id,
    url: buildAttachmentPublicPath(BUILD_SUBJECT_MOC, mocId, r.storedFile),
    originalName: r.originalName,
    byteSize: r.byteSize,
    createdAt: r.createdAt,
  }));

  const partTotalQty = sheet.ok
    ? sheet.full?.totalPartQty ?? sheet.shortage?.totalPartQty ?? null
    : null;
  const gobricksGdsPriceCny = sheet.ok ? sheet.gobricksGdsPriceCny : null;

  let initialFull: InitialBuildSheetFromServer | null = null;
  let initialShortage: InitialBuildSheetFromServer | null = null;
  let initialFulfillment: InitialBuildSheetFromServer | null = null;
  let initialMocLoadError: string | null = null;
  if (sheet.ok) {
    if (sheet.full) {
      initialFull = {
        subjectId: sheet.subjectId,
        skippedHeader: sheet.full.skippedHeader,
        items: sheet.full.items,
        savedAt: sheet.full.savedAt,
      };
    }
    if (sheet.shortage) {
      initialShortage = {
        subjectId: sheet.subjectId,
        skippedHeader: sheet.shortage.skippedHeader,
        items: sheet.shortage.items,
        savedAt: sheet.shortage.savedAt,
      };
    }
    if (sheet.fulfillment) {
      initialFulfillment = {
        subjectId: sheet.subjectId,
        skippedHeader: sheet.fulfillment.skippedHeader,
        items: fulfillmentItemsForDisplay(sheet.fulfillment.items),
        savedAt: sheet.fulfillment.savedAt,
      };
    }
  } else {
    initialMocLoadError = sheet.error;
  }

  return (
    <div className="page-stack">
      <MocDetailEditorial
        subjectId={mocId}
        images={galleryImages}
        attachments={attachmentRows}
        initialDisplayName={initialDisplayName}
        initialTags={initialTags}
        partTotalQty={partTotalQty}
        gobricksGdsPriceCny={gobricksGdsPriceCny}
      />

      <BuildWorkflowProgressPanel
        subjectKind={BUILD_SUBJECT_MOC}
        subjectId={mocId}
        initialStage={workflowProgress.stage}
        initialTimes={workflowProgress.times}
      />

      <Suspense fallback={null}>
        <MocDetailPartsSection
          subjectId={mocId}
          exportDisplayName={initialDisplayName}
          initialFull={initialFull}
          initialShortage={initialShortage}
          initialFulfillment={initialFulfillment}
          initialShortageClearedAt={sheet.ok ? sheet.shortageClearedAt ?? null : null}
          initialMocLoadError={initialMocLoadError}
          parentSubjectOwned={workflowProgress.stage === "complete"}
          ioSplitPlans={ioSplitPlans}
        />
      </Suspense>
    </div>
  );
}
