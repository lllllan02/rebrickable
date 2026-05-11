import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNotNull, min, ne } from "drizzle-orm";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { loadBuildPartsSheetFromDb } from "@/app/mocs/moc-parts-sheet-actions";
import { MocDetailEditorial, type SetDetailOfficialMeta } from "@/app/mocs/moc-detail-editorial";
import { MocDetailPartsSection } from "@/app/mocs/moc-detail-parts-section";
import type { MocAttachmentRow } from "@/app/mocs/moc-attachments-panel";
import type { MocGalleryImage } from "@/app/mocs/moc-image-carousel";
import { getDb } from "@/db/client";
import {
  buildAttachments,
  buildImages,
  buildProfiles,
  colors,
  inventories,
  inventoryParts,
  legoSets,
  partCategories,
  parts,
} from "@/db/schema";
import { officialInventoryRowsToShortageResolveItems } from "@/lib/official-inventory-to-resolve-items";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { buildAttachmentPublicPath } from "@/lib/build-attachment-public-path";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { parseTagsJson } from "@/lib/moc-profile-parse";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ setNum: string }> };

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export default async function SetDetailPage({ params }: Props) {
  const { setNum: raw } = await params;
  const setNum = decodeURIComponent(raw);

  const db = getDb();
  const setImgKey = and(eq(buildImages.subjectKind, BUILD_SUBJECT_SET), eq(buildImages.subjectId, setNum));
  const setAttKey = and(
    eq(buildAttachments.subjectKind, BUILD_SUBJECT_SET),
    eq(buildAttachments.subjectId, setNum)
  );
  const setProfKey = and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_SET), eq(buildProfiles.subjectId, setNum));

  const [[inv], [catalog], imgRows, attRows, sheet, profileRow] = await Promise.all([
    db
      .select({
        id: inventories.id,
        version: inventories.version,
      })
      .from(inventories)
      .where(eq(inventories.setNum, setNum))
      .orderBy(desc(inventories.version), desc(inventories.id))
      .limit(1),
    db
      .select({
        name: legoSets.name,
        year: legoSets.year,
        imgUrl: legoSets.imgUrl,
      })
      .from(legoSets)
      .where(eq(legoSets.setNum, setNum))
      .limit(1),
    db
      .select({
        id: buildImages.id,
        storedFile: buildImages.storedFile,
        originalName: buildImages.originalName,
        createdAt: buildImages.createdAt,
      })
      .from(buildImages)
      .where(setImgKey)
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
      .where(setAttKey)
      .orderBy(asc(buildAttachments.createdAt), asc(buildAttachments.id)),
    loadBuildPartsSheetFromDb(BUILD_SUBJECT_SET, setNum),
    db.select().from(buildProfiles).where(setProfKey).limit(1),
  ]);

  if (!inv) notFound();

  const setBoxImg =
    catalog && usableImgUrl(catalog.imgUrl) ? catalog.imgUrl.trim() : null;

  const imgClause = and(
    eq(inventoryParts.inventoryId, inv.id),
    isNotNull(inventoryParts.imgUrl),
    ne(inventoryParts.imgUrl, "")
  );

  const [lines, partHeroRow] = await Promise.all([
    db
      .select({
        partNum: inventoryParts.partNum,
        name: parts.name,
        colorId: inventoryParts.colorId,
        colorName: colors.name,
        quantity: inventoryParts.quantity,
        isSpare: inventoryParts.isSpare,
        imgUrl: inventoryParts.imgUrl,
        partCatName: partCategories.name,
      })
      .from(inventoryParts)
      .innerJoin(parts, eq(inventoryParts.partNum, parts.partNum))
      .leftJoin(partCategories, eq(parts.partCatId, partCategories.id))
      .innerJoin(colors, eq(inventoryParts.colorId, colors.id))
      .where(eq(inventoryParts.inventoryId, inv.id))
      .orderBy(asc(inventoryParts.partNum), asc(inventoryParts.colorId)),
    setBoxImg
      ? Promise.resolve([{ thumb: null as string | null }])
      : db
          .select({ thumb: min(inventoryParts.imgUrl) })
          .from(inventoryParts)
          .where(imgClause),
  ]);

  const profile = profileRow[0];
  const initialDisplayName = (profile?.displayName ?? "").trim();
  const initialTags = parseTagsJson(profile?.tagsJson);

  const galleryImages: MocGalleryImage[] = imgRows.map((r) => ({
    id: r.id,
    url: buildImagePublicPath(BUILD_SUBJECT_SET, setNum, r.storedFile),
    originalName: r.originalName,
    createdAt: r.createdAt,
  }));

  const attachmentRows: MocAttachmentRow[] = attRows.map((r) => ({
    id: r.id,
    url: buildAttachmentPublicPath(BUILD_SUBJECT_SET, setNum, r.storedFile),
    originalName: r.originalName,
    byteSize: r.byteSize,
    createdAt: r.createdAt,
  }));

  const invTotalQty = lines.reduce((a, l) => a + l.quantity, 0);
  const sheetTotalQty = sheet.ok
    ? sheet.full?.totalPartQty ?? sheet.shortage?.totalPartQty ?? null
    : null;
  const partTotalQty = sheetTotalQty ?? (lines.length > 0 ? invTotalQty : null);

  const officialInventoryItems = officialInventoryRowsToShortageResolveItems(
    lines.map((l) => ({
      partNum: l.partNum,
      name: l.name,
      colorId: l.colorId,
      colorName: l.colorName,
      quantity: l.quantity,
      isSpare: l.isSpare,
      imgUrl: l.imgUrl,
      partCatName: l.partCatName ?? null,
    }))
  );

  let initialFull: InitialMocSheetFromServer | null = null;
  let initialShortage: InitialMocSheetFromServer | null = null;
  let initialSheetLoadError: string | null = null;
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
  } else {
    initialSheetLoadError = sheet.error;
  }

  const heroThumb = setBoxImg ?? partHeroRow[0]?.thumb ?? null;
  const heroIsSetBox = Boolean(setBoxImg);
  const sumQty = lines.reduce((a, l) => a + (l.isSpare ? 0 : l.quantity), 0);
  const spareQty = lines.reduce((a, l) => a + (l.isSpare ? l.quantity : 0), 0);
  const uniqueParts = new Set(lines.map((l) => l.partNum)).size;

  const setOfficial: SetDetailOfficialMeta = {
    setNum,
    catalogName: catalog?.name ?? null,
    year: catalog?.year ?? null,
    invVersion: inv.version,
    invId: inv.id,
    uniqueParts,
    sumQty,
    spareQty,
    heroThumb,
    heroIsSetBox,
  };

  return (
    <div className="page-stack">
      <MocDetailEditorial
        subjectKind={BUILD_SUBJECT_SET}
        subjectId={setNum}
        images={galleryImages}
        attachments={attachmentRows}
        initialDisplayName={initialDisplayName}
        initialTags={initialTags}
        partTotalQty={partTotalQty}
        setOfficial={setOfficial}
      />

      <MocDetailPartsSection
        subjectKind={BUILD_SUBJECT_SET}
        subjectId={setNum}
        initialFull={initialFull}
        initialShortage={initialShortage}
        initialMocLoadError={initialSheetLoadError}
        officialInventory={
          officialInventoryItems.length > 0
            ? {
                items: officialInventoryItems,
                inventoryId: inv.id,
                version: inv.version,
              }
            : null
        }
      />
    </div>
  );
}
