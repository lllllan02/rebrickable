import { asc, eq } from "drizzle-orm";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { loadMocPartsSheetFromDb } from "@/app/mocs/moc-parts-sheet-actions";
import { MocDetailPartsSection } from "@/app/mocs/moc-detail-parts-section";
import { getDb } from "@/db/client";
import { mocAttachments, mocImages, mocProfiles } from "@/db/schema";
import { mocAttachmentPublicPath } from "@/lib/moc-attachment-public-path";
import { mocImagePublicPath } from "@/lib/moc-image-public-path";
import { parseTagsJson } from "@/lib/moc-profile-parse";

import { MocDetailEditorial } from "../moc-detail-editorial";
import type { MocAttachmentRow } from "../moc-attachments-panel";
import type { MocGalleryImage } from "../moc-image-carousel";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ mocId: string }> };

export default async function MocDetailPage({ params }: Props) {
  const { mocId: raw } = await params;
  const mocId = decodeURIComponent(raw);

  const db = getDb();
  const [imgRows, attRows, sheet, profileRow] = await Promise.all([
    db
      .select({
        id: mocImages.id,
        storedFile: mocImages.storedFile,
        originalName: mocImages.originalName,
        createdAt: mocImages.createdAt,
      })
      .from(mocImages)
      .where(eq(mocImages.mocId, mocId))
      .orderBy(asc(mocImages.createdAt), asc(mocImages.id)),
    db
      .select({
        id: mocAttachments.id,
        storedFile: mocAttachments.storedFile,
        originalName: mocAttachments.originalName,
        byteSize: mocAttachments.byteSize,
        createdAt: mocAttachments.createdAt,
      })
      .from(mocAttachments)
      .where(eq(mocAttachments.mocId, mocId))
      .orderBy(asc(mocAttachments.createdAt), asc(mocAttachments.id)),
    loadMocPartsSheetFromDb(mocId),
    db.select().from(mocProfiles).where(eq(mocProfiles.mocId, mocId)).limit(1),
  ]);

  const profile = profileRow[0];
  const initialDisplayName = (profile?.displayName ?? "").trim();
  const initialTags = parseTagsJson(profile?.tagsJson);

  const galleryImages: MocGalleryImage[] = imgRows.map((r) => ({
    id: r.id,
    url: mocImagePublicPath(mocId, r.storedFile),
    originalName: r.originalName,
    createdAt: r.createdAt,
  }));

  const attachmentRows: MocAttachmentRow[] = attRows.map((r) => ({
    id: r.id,
    url: mocAttachmentPublicPath(mocId, r.storedFile),
    originalName: r.originalName,
    byteSize: r.byteSize,
    createdAt: r.createdAt,
  }));

  const rbHref = `https://rebrickable.com/mocs/MOC-${encodeURIComponent(mocId)}/`;
  const partTotalQty = sheet.ok
    ? sheet.full?.totalPartQty ?? sheet.shortage?.totalPartQty ?? null
    : null;

  let initialFull: InitialMocSheetFromServer | null = null;
  let initialShortage: InitialMocSheetFromServer | null = null;
  let initialMocLoadError: string | null = null;
  if (sheet.ok) {
    if (sheet.full) {
      initialFull = {
        mocId: sheet.mocId,
        skippedHeader: sheet.full.skippedHeader,
        items: sheet.full.items,
        savedAt: sheet.full.savedAt,
      };
    }
    if (sheet.shortage) {
      initialShortage = {
        mocId: sheet.mocId,
        skippedHeader: sheet.shortage.skippedHeader,
        items: sheet.shortage.items,
        savedAt: sheet.shortage.savedAt,
      };
    }
  } else {
    initialMocLoadError = sheet.error;
  }

  return (
    <div className="page-stack">
      <MocDetailEditorial
        mocId={mocId}
        rbHref={rbHref}
        images={galleryImages}
        attachments={attachmentRows}
        initialDisplayName={initialDisplayName}
        initialTags={initialTags}
        partTotalQty={partTotalQty}
      />

      <MocDetailPartsSection
        mocId={mocId}
        initialFull={initialFull}
        initialShortage={initialShortage}
        initialMocLoadError={initialMocLoadError}
      />
    </div>
  );
}
