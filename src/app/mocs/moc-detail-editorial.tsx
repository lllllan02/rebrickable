"use client";

import Link from "next/link";

import { MocAttachmentsPanel, type MocAttachmentRow } from "@/app/mocs/moc-attachments-panel";
import { MocImageCarousel, type MocGalleryImage } from "@/app/mocs/moc-image-carousel";
import { MocProfileForm } from "@/app/mocs/moc-profile-form";
import { buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  images: MocGalleryImage[];
  attachments: MocAttachmentRow[];
  initialDisplayName: string;
  initialTags: string[];
  /** 已存零件表各行列 quantity 之和；无表时为 null */
  partTotalQty: number | null;
};

export function MocDetailEditorial({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  images,
  attachments,
  initialDisplayName,
  initialTags,
  partTotalQty,
}: Props) {
  const ui = buildSubjectUi(subjectKind);
  const rbHref = ui.rebrickableUrl(subjectId);
  const listHref = buildSubjectListPath(subjectKind);

  return (
    <section className="hero-panel">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start lg:gap-10">
        <div className="min-w-0 lg:col-span-2">
          <MocImageCarousel subjectKind={subjectKind} subjectId={subjectId} images={images} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5 border-t border-[var(--border-soft)] pt-6 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="page-kicker">{ui.detailSidebarKicker}</p>
          <MocProfileForm
            variant="sidebar"
            subjectKind={subjectKind}
            subjectId={subjectId}
            initialDisplayName={initialDisplayName}
            initialTags={initialTags}
            partTotalQty={partTotalQty}
          />

          <MocAttachmentsPanel subjectKind={subjectKind} subjectId={subjectId} attachments={attachments} />

          <nav className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-4 text-sm">
            <a
              href={rbHref}
              className="text-[var(--accent)] underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              {ui.rbLinkLabel(subjectId)}
            </a>
            <Link
              href={listHref}
              className="text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            >
              {ui.backToListLabel}
            </Link>
          </nav>
        </aside>
      </div>
    </section>
  );
}
