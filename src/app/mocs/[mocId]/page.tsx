import { asc, eq } from "drizzle-orm";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { loadMocPartsSheetFromDb } from "@/app/mocs/moc-parts-sheet-actions";
import { PartsSheetImport } from "@/app/mocs/moc-parts-sheet-import";
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
  const partTotalQty = sheet.ok ? sheet.totalPartQty : null;

  let initialMocSheet: InitialMocSheetFromServer | null = null;
  let initialMocLoadError: string | null = null;
  if (sheet.ok) {
    initialMocSheet = {
      mocId: sheet.mocId,
      skippedHeader: sheet.skippedHeader,
      items: sheet.items,
      savedAt: sheet.savedAt,
    };
  } else {
    initialMocLoadError = sheet.error;
  }

  return (
    <div className="page-stack">
      <MocDetailEditorial
        mocId={mocId}
        rbHref={rbHref}
        images={galleryImages}
        initialDisplayName={initialDisplayName}
        initialTags={initialTags}
        partTotalQty={partTotalQty}
      />

      <div id="moc-parts-sheet-tools" className="section-panel scroll-mt-24">
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text)]">零件表</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              与{" "}
              <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
                rebrickable_parts_*_缺货表.csv
              </code>{" "}
              相同结构。选择 CSV 解析成功后会立刻覆盖并保存到本 MOC。可在此导出 Excel 或 CSV；零件缩略图与浏览见下方列表。新 MOC 也可从{" "}
              <a href="/mocs" className="text-[var(--accent)] underline">
                MOC 列表
              </a>{" "}
              顶部上传导入。
            </p>
          </div>
          <PartsSheetImport
            requestedLoadMocId={mocId}
            initialMocSheet={initialMocSheet}
            initialMocLoadError={initialMocLoadError}
            mocDetailEmbed
          />
        </section>
      </div>

      {sheet.ok ? (
        <div className="section-panel">
          <MocPartsList
            items={sheet.items}
            skippedHeader={sheet.skippedHeader}
            savedAt={sheet.savedAt}
            totalPartQty={sheet.totalPartQty}
          />
        </div>
      ) : (
        <section className="rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--muted)]">
          <p>暂无已存零件列表视图：{sheet.error}</p>
          <p className="mt-2">
            可在上方「零件表」区域选择 CSV；解析成功后会自动保存，随后本页将显示带缩略图的浏览列表。
          </p>
        </section>
      )}
    </div>
  );
}
