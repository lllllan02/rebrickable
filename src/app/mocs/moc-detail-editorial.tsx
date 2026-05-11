"use client";

import Link from "next/link";

import { MocImageCarousel, type MocGalleryImage } from "@/app/mocs/moc-image-carousel";
import { MocProfileForm } from "@/app/mocs/moc-profile-form";

type Props = {
  mocId: string;
  rbHref: string;
  partsSheetHref: string;
  images: MocGalleryImage[];
  initialDisplayName: string;
  initialTags: string[];
};

export function MocDetailEditorial({
  mocId,
  rbHref,
  partsSheetHref,
  images,
  initialDisplayName,
  initialTags,
}: Props) {
  return (
    <section className="hero-panel">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start lg:gap-10">
        <div className="min-w-0 lg:col-span-2">
          <MocImageCarousel mocId={mocId} images={images} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5 border-t border-[var(--border-soft)] pt-6 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="page-kicker">本地资料</p>
          <MocProfileForm
            variant="sidebar"
            mocId={mocId}
            initialDisplayName={initialDisplayName}
            initialTags={initialTags}
          />

          <nav className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-4 text-sm">
            <a href={rbHref} className="text-[var(--accent)] underline underline-offset-2" target="_blank" rel="noreferrer">
              在 Rebrickable 打开 MOC-{mocId}
            </a>
            <Link href={partsSheetHref} className="text-[var(--accent)] underline underline-offset-2">
              编辑零件表并保存
            </Link>
            <Link href="/mocs" className="text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline">
              返回 MOC 列表
            </Link>
          </nav>

          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            零件清单在页面下方。参考图仅存本机；在输入框外可用 ⌘V / Ctrl+V 粘贴图片。列表封面取上传时间最早的一张。
          </p>
        </aside>
      </div>
    </section>
  );
}
