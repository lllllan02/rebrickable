import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { loadMocPartsSheetFromDb } from "@/app/mocs/moc-parts-sheet-actions";
import { getDb } from "@/db/client";
import { mocImages, mocProfiles } from "@/db/schema";
import { mocImagePublicPath } from "@/lib/moc-image-public-path";
import { parseTagsJson } from "@/lib/moc-profile-parse";

import { MocDetailEditorial } from "../moc-detail-editorial";
import type { MocGalleryImage } from "../moc-image-carousel";
import { MocPartsList } from "../moc-parts-list";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ mocId: string }> };

export default async function MocDetailPage({ params }: Props) {
  const { mocId: raw } = await params;
  const mocId = decodeURIComponent(raw);

  const db = getDb();
  const [imgRows, sheet, profileRow] = await Promise.all([
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

  const rbHref = `https://rebrickable.com/mocs/MOC-${encodeURIComponent(mocId)}/`;
  const partsSheetHref = `/mocs/import?loadMoc=${encodeURIComponent(mocId)}`;
  const partTotalQty = sheet.ok ? sheet.totalPartQty : null;

  return (
    <div className="page-stack">
      <MocDetailEditorial
        mocId={mocId}
        rbHref={rbHref}
        partsSheetHref={partsSheetHref}
        images={galleryImages}
        initialDisplayName={initialDisplayName}
        initialTags={initialTags}
        partTotalQty={partTotalQty}
      />

      {sheet.ok ? (
        <div className="section-panel">
          <MocPartsList
            items={sheet.items}
            skippedHeader={sheet.skippedHeader}
            savedAt={sheet.savedAt}
            partsSheetHref={partsSheetHref}
            totalPartQty={sheet.totalPartQty}
          />
        </div>
      ) : (
        <section className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--muted)]">
          <p>暂无已存零件表：{sheet.error}</p>
          <p className="mt-2">
            可在{" "}
            <Link href="/mocs/import" className="text-[var(--accent)] underline">
              零件表导入
            </Link>{" "}
            页导入 CSV 后保存到该 MOC ID。
          </p>
        </section>
      )}
    </div>
  );
}
