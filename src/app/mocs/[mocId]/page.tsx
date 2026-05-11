import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { loadMocPartsSheetFromDb } from "@/app/parts-sheet/actions";
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
  const partsSheetHref = `/parts-sheet?loadMoc=${encodeURIComponent(mocId)}`;

  return (
    <div className="page-stack">
      <MocDetailEditorial
        mocId={mocId}
        rbHref={rbHref}
        partsSheetHref={partsSheetHref}
        images={galleryImages}
        initialDisplayName={initialDisplayName}
        initialTags={initialTags}
      />

      {sheet.ok ? (
        <div className="section-panel">
          <MocPartsList
            items={sheet.items}
            skippedHeader={sheet.skippedHeader}
            savedAt={sheet.savedAt}
            partsSheetHref={partsSheetHref}
          />
        </div>
      ) : (
        <section className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--muted)]">
          <p>暂无已存零件表：{sheet.error}</p>
          <p className="mt-2">
            可在{" "}
            <Link href="/parts-sheet" className="text-[var(--accent)] underline">
              零件表
            </Link>{" "}
            导入 CSV 后保存到该 MOC ID。
          </p>
        </section>
      )}
    </div>
  );
}
