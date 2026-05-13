"use client";

import Link from "next/link";

import { BuildFavoriteToggle } from "@/app/build/build-favorite-toggle";
import { BuildOwnedToggle } from "@/app/build/build-owned-toggle";
import { MocAttachmentsPanel, type MocAttachmentRow } from "@/app/mocs/moc-attachments-panel";
import { MocImageCarousel, type MocGalleryImage } from "@/app/mocs/moc-image-carousel";
import { MocProfileForm } from "@/app/mocs/moc-profile-form";
import { buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";

/** 套装详情：与 Rebrickable 目录同步的官方封面与库存元数据（并入主面板侧栏 / 主图区） */
export type SetDetailOfficialMeta = {
  setNum: string;
  catalogName: string | null;
  year: number | null;
  invVersion: number;
  invId: number;
  uniqueParts: number;
  sumQty: number;
  spareQty: number;
  heroThumb: string | null;
  heroIsSetBox: boolean;
};

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  images: MocGalleryImage[];
  attachments: MocAttachmentRow[];
  initialDisplayName: string;
  initialTags: string[];
  /** 已存零件表各行列 quantity 之和；无表时为 null */
  partTotalQty: number | null;
  /** 仅套装：官方盒图 / 占位与目录元数据，与 MOC 主面板同栅格展示 */
  setOfficial?: SetDetailOfficialMeta | null;
  /** 是否在「我的拥有」中标记（本地 SQLite） */
  initialOwned: boolean;
  /** 是否加入「收藏」（本地 SQLite） */
  initialFavorite: boolean;
};

export function MocDetailEditorial({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  images,
  attachments,
  initialDisplayName,
  initialTags,
  partTotalQty,
  setOfficial = null,
  initialOwned,
  initialFavorite,
}: Props) {
  const ui = buildSubjectUi(subjectKind);
  const rbHref = ui.rebrickableUrl(subjectId);
  const listHref = buildSubjectListPath(subjectKind);
  const o = setOfficial;

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
          <p className="page-kicker">{ui.detailSidebarKicker}</p>
          <MocProfileForm
            variant="sidebar"
            subjectKind={subjectKind}
            subjectId={subjectId}
            initialDisplayName={initialDisplayName}
            initialTags={initialTags}
            partTotalQty={partTotalQty}
          />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[var(--border-soft)] pt-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-sm text-[var(--text)]">拥有此{ui.noun}</span>
              <BuildOwnedToggle subjectKind={subjectKind} subjectId={subjectId} initialOwned={initialOwned} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm text-[var(--muted)]">收藏</span>
              <BuildFavoriteToggle subjectKind={subjectKind} subjectId={subjectId} initialFavorite={initialFavorite} />
            </div>
          </div>

          {o ? (
            <div className="flex flex-col gap-3 border-t border-[var(--border-soft)] pt-4">
              <h2 className="text-base font-semibold text-[var(--text)]">官方元数据与库存</h2>
              <p className="font-mono text-xl font-extrabold tracking-tight text-[var(--accent)]">{o.setNum}</p>
              {o.catalogName ? <p className="text-sm text-[var(--text)]">{o.catalogName}</p> : null}
              <dl className="meta-row text-sm">
                {o.year != null ? (
                  <div>
                    <dt className="inline text-[var(--text)]">年份：</dt>
                    <dd className="inline">{o.year}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="inline text-[var(--text)]">库存版本：</dt>
                  <dd className="inline">{o.invVersion}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--text)]">inventory_id：</dt>
                  <dd className="inline font-mono">{o.invId}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--text)]">零件种类：</dt>
                  <dd className="inline">{o.uniqueParts.toLocaleString("zh-CN")}</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--text)]">主件：</dt>
                  <dd className="inline">{o.sumQty.toLocaleString("zh-CN")} 粒</dd>
                </div>
                <div>
                  <dt className="inline text-[var(--text)]">备用件：</dt>
                  <dd className="inline">{o.spareQty.toLocaleString("zh-CN")} 粒</dd>
                </div>
              </dl>
              <p className="text-xs text-[var(--muted)]">
                其他套装请见{" "}
                <Link href="/sets" className="text-[var(--accent)] underline underline-offset-2">
                  套装列表
                </Link>
                。
              </p>
            </div>
          ) : null}

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
