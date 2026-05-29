"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { MocAttachmentsPanel, type MocAttachmentRow } from "@/app/mocs/moc-attachments-panel";
import { MocDeleteControl } from "@/app/mocs/moc-delete-control";
import { MocImageCarousel, type MocGalleryImage } from "@/app/mocs/moc-image-carousel";
import { MocProfileForm } from "@/app/mocs/moc-profile-form";
import { buildSubjectDetailPath, buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";
import type { MocDerivedFromSetMeta } from "@/lib/moc-derived-from-set";
import type { SetDetailOfficialMeta } from "@/lib/set-detail-official-meta";

export type { SetDetailOfficialMeta };

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  images: MocGalleryImage[];
  attachments: MocAttachmentRow[];
  initialDisplayName: string;
  initialTags: string[];
  initialPremium?: boolean;
  /** 已存零件表各行列 quantity 之和；无表时为 null */
  partTotalQty: number | null;
  /** 高砖整单参考价（元），来自接口根字段 `gdsPrice`；未对照高砖时为 null */
  gobricksGdsPriceCny?: number | null;
  /** 仅套装：已存缺件/配货表粒数（与官方库存不同时显示） */
  savedSheetPartTotalQty?: number | null;
  /** 仅套装：官方盒图 / 占位与目录元数据，与 MOC 主面板同栅格展示 */
  setOfficial?: SetDetailOfficialMeta | null;
  /** 仅 MOC：改编自的官方套装（详情页链回套装） */
  derivedFromSet?: MocDerivedFromSetMeta | null;
  /** 仅套装详情：侧栏「改编为 MOC」区块 */
  setPageAside?: ReactNode;
};

export function MocDetailEditorial({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  images,
  attachments,
  initialDisplayName,
  initialTags,
  initialPremium = false,
  partTotalQty,
  gobricksGdsPriceCny = null,
  savedSheetPartTotalQty = null,
  setOfficial = null,
  derivedFromSet = null,
  setPageAside = null,
}: Props) {
  const ui = buildSubjectUi(subjectKind);
  const rbHref = ui.rebrickableUrl(subjectId);
  const listHref = buildSubjectListPath(subjectKind);
  const o = setOfficial;
  const isMoc = subjectKind === BUILD_SUBJECT_MOC;
  const deleteDisplayTitle = initialDisplayName.trim() || `${ui.noun} ${subjectId}`;

  return (
    <section className="hero-panel">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {o ? <p className="page-kicker">Rebrickable 目录</p> : null}
          <MocImageCarousel
            subjectKind={subjectKind}
            subjectId={subjectId}
            images={images}
            catalogLeadCover={
              o && o.heroThumb
                ? {
                    url: o.heroThumb,
                    alt: o.heroIsSetBox ? `${o.setNum} 套装盒照` : `${o.setNum} 官方人仔或目录配图`,
                    heroIsSetBox: o.heroIsSetBox,
                  }
                : null
            }
            galleryKind={o ? "set" : "default"}
          />
          {o && !o.heroIsSetBox && o.heroThumb ? (
            <p className="text-xs text-[var(--muted)]">
              轮播首张为官方人仔/目录图；若 rb 暂无该图导致链接失效，页面会显示「暂无官方图」而非裂图。补充盒图可导入{" "}
              <code className="code-pill">sets.csv.gz</code> 并重新执行{" "}
              <code className="code-pill">pnpm db:import</code>。
            </p>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-5 border-t border-[var(--border-soft)] pt-6 lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="page-kicker">{o ? "套装资料" : ui.detailSidebarKicker}</p>
          <div className={o ? "flex flex-col gap-4" : undefined}>
            <MocProfileForm
              variant="sidebar"
              subjectKind={subjectKind}
              subjectId={subjectId}
              initialDisplayName={initialDisplayName}
              initialTags={initialTags}
              initialPremium={isMoc ? initialPremium : false}
              partTotalQty={partTotalQty}
              gobricksGdsPriceCny={gobricksGdsPriceCny}
              setOfficial={o ?? undefined}
              savedSheetPartTotalQty={o ? savedSheetPartTotalQty : undefined}
            />
            {o && setPageAside ? setPageAside : null}
          </div>

          {isMoc && derivedFromSet ? (
            <div className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-4">
              <h2 className="text-base font-semibold text-[var(--text)]">改编自官方套装</h2>
              <p className="text-sm text-[var(--muted)]">
                本 MOC 由套装{" "}
                <span className="font-mono text-[var(--text)]">{derivedFromSet.setNum}</span>
                {derivedFromSet.catalogName ? <>（{derivedFromSet.catalogName}）</> : null}{" "}
                改编。
              </p>
            </div>
          ) : null}

          <MocAttachmentsPanel subjectKind={subjectKind} subjectId={subjectId} attachments={attachments} />

          <nav className="flex flex-col gap-2 border-t border-[var(--border-soft)] pt-4 text-sm">
            {isMoc && derivedFromSet ? (
              <Link
                href={buildSubjectDetailPath(BUILD_SUBJECT_SET, derivedFromSet.setNum)}
                className="text-[var(--accent)] underline underline-offset-2"
              >
                打开官方套装 {derivedFromSet.setNum}
                {derivedFromSet.catalogName ? `（${derivedFromSet.catalogName}）` : ""}
              </Link>
            ) : (
              <a
                href={rbHref}
                className="text-[var(--accent)] underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {ui.rbLinkLabel(subjectId)}
              </a>
            )}
            <Link
              href={listHref}
              className="text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline"
            >
              {ui.backToListLabel}
            </Link>
            {o ? (
              <Link href="/sets" className="text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline">
                浏览套装列表
              </Link>
            ) : null}
          </nav>

          {isMoc ? <MocDeleteControl mocId={subjectId} displayTitle={deleteDisplayTitle} /> : null}
        </aside>
      </div>
    </section>
  );
}
