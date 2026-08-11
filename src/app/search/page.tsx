import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { SavedSubjectListRow } from "@/app/build/saved-subject-list-row";
import { PurchaseListAddToggle } from "@/app/parts/purchase/purchase-list-add-toggle";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { ColorSwatchResultCard } from "@/components/subject-result-card";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { runGlobalSearch } from "@/lib/global-search-server";
import { loadPurchaseListPartNums } from "@/lib/load-purchase-list";
import { mocListHref } from "@/lib/moc-list-href";
import { loadUpgradeTargetsForParts } from "@/lib/part-upgrades";
import { likeFragment } from "@/lib/search";

import { enrichSearchSubjectHits, subjectIdFromListHref } from "./search-subject-hit-enrich";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const title = q ? `搜索：${q}` : "全站搜索";
  return { title };
}

function Section({
  title,
  children,
  moreLink,
}: {
  title: string;
  children: ReactNode;
  moreLink?: { href: string; label: string };
}) {
  return (
    <section className="search-results-section">
      <h2 className="search-results-section-title">{title}</h2>
      <div className="search-results-section-body">{children}</div>
      {moreLink ? (
        <div className="search-results-section-footer">
          <Link href={moreLink.href} className="search-results-more-link">
            {moreLink.label}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const qRaw = (sp.q ?? "").trim();
  const qSafe = likeFragment(qRaw);

  if (!qSafe) {
    return (
      <div className="page-stack">
        <section className="hero-panel">
          <p className="page-kicker">Search</p>
          <h1 className="page-title">全站搜索</h1>
          <p className="page-description text-[var(--muted)]">
            在顶部导航的搜索框中输入关键词，按 Enter 可打开结果页；每类最多预览 5 条，更多请从结果页进入 MOC / 套装 / 零件列表并带同一关键词筛选。
          </p>
        </section>
      </div>
    );
  }

  const data = await runGlobalSearch({ qRaw, variant: "page" });
  const total =
    data.mocs.length +
    data.sets.length +
    data.parts.length +
    data.colors.length +
    data.elements.length;

  const mocIds = [
    ...new Set(
      data.mocs.map((h) => subjectIdFromListHref(h.href, "mocs")).filter((x): x is string => x != null && x.length > 0),
    ),
  ];
  const setNums = [
    ...new Set(
      data.sets.map((h) => subjectIdFromListHref(h.href, "sets")).filter((x): x is string => x != null && x.length > 0),
    ),
  ];

  const enrich = await enrichSearchSubjectHits(mocIds, setNums);
  const searchPartNums = [
    ...data.parts.map((h) => h.title),
    ...data.elements.map((h) => h.partNum),
  ];
  const [purchasePartNums, upgradeMap] = await Promise.all([
    loadPurchaseListPartNums(searchPartNums),
    loadUpgradeTargetsForParts(searchPartNums),
  ]);

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">Search</p>
        <h1 className="page-title">搜索结果</h1>
        <p className="page-description text-[var(--muted)]">
          关键词 <span className="font-mono text-[var(--text)]">{qRaw}</span>
          {total > 0 ? ` · 本页每类最多 5 条，共展示 ${total} 条` : " · 无匹配"}
        </p>
      </section>

      {total === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-6 text-sm text-[var(--muted)]">
          无匹配结果。可尝试更短的编号片段或名称关键词。
        </p>
      ) : (
        <div className="search-results-stack">
          {data.mocs.length > 0 ? (
            <Section
              title="MOC"
              moreLink={{
                href: `/mocs?q=${encodeURIComponent(qRaw)}`,
                label: "前往 MOC 列表继续筛选",
              }}
            >
              <ul className="list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list">
                {data.mocs.map((h) => {
                  const subjectId = subjectIdFromListHref(h.href, "mocs") ?? "";
                  if (!subjectId) return null;
                  const prof = enrich.mocProfileById.get(subjectId);
                  const displayName = prof?.displayName?.trim() ?? "";
                  const title = displayName || h.title || `MOC ${subjectId}`;
                  const tags = prof?.tags ?? [];
                  const stored = enrich.mocCoverStored.get(subjectId);
                  const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, subjectId, stored) : null;
                  const sheet = enrich.sheetByKindId.get(`${BUILD_SUBJECT_MOC}:${subjectId}`);
                  const totalPartQty = sheet?.totalPartQty ?? 0;
                  const updatedAtIso = sheet?.updatedAt ?? "2000-01-01T00:00:00.000Z";
                  const workflowStage = enrich.mocWorkflowStage.get(subjectId) ?? null;
                  return (
                    <SavedSubjectListRow
                      key={h.href}
                      kind={BUILD_SUBJECT_MOC}
                      subjectId={subjectId}
                      detailHref={h.href}
                      title={title}
                      coverUrl={uploadCoverUrl}
                      tags={tags}
                      mocTagHref={(tag) => mocListHref({ q: qSafe, tag })}
                      totalPartQty={totalPartQty}
                      shortageLineCount={sheet?.shortageLineCount ?? null}
                      shortageTotalQty={sheet?.shortageTotalQty ?? null}
                      shortageClearedAt={sheet?.shortageClearedAt ?? null}
                      gobricksShortageSyncAt={sheet?.gobricksShortageSyncAt ?? null}
                      gobricksGdsPriceCny={sheet?.gobricksGdsPriceCny ?? null}
                      updatedAtIso={updatedAtIso}
                      workflowStage={workflowStage}
                      showInstructionBadge={Boolean(prof?.hasInstructionsPdf)}
                      showSourceBadge={Boolean(prof?.hasIoSource)}
                    />
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {data.sets.length > 0 ? (
            <Section
              title="套装"
              moreLink={{
                href: `/sets?q=${encodeURIComponent(qRaw)}`,
                label: "前往套装页继续筛选（官方目录）",
              }}
            >
              <ul className="list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list">
                {data.sets.map((h) => {
                  const setNum = subjectIdFromListHref(h.href, "sets") ?? h.title;
                  if (!setNum) return null;
                  const prof = enrich.setProfileByNum.get(setNum);
                  const displayName = prof?.displayName?.trim() ?? "";
                  const catalogName = (h.subtitle ?? "").trim();
                  const title = displayName || catalogName || `套装 ${setNum}`;
                  const tags = prof?.tags ?? [];
                  const officialUrl = enrich.officialHeroBySet.get(setNum) ?? null;
                  const stored = enrich.setCoverStored.get(setNum);
                  const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_SET, setNum, stored) : null;
                  const coverUrl =
                    (officialUrl && officialUrl.length > 0 ? officialUrl : null) ?? uploadCoverUrl ?? null;
                  const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, setNum);
                  const sheet = enrich.sheetByKindId.get(`${BUILD_SUBJECT_SET}:${setNum}`);
                  const totalPartQty = sheet?.totalPartQty ?? 0;
                  const updatedAtIso = sheet?.updatedAt ?? "2000-01-01T00:00:00.000Z";
                  const workflowStage = enrich.setWorkflowStage.get(setNum) ?? null;
                  return (
                    <SavedSubjectListRow
                      key={h.href}
                      kind={BUILD_SUBJECT_SET}
                      subjectId={setNum}
                      detailHref={detailHref}
                      title={title}
                      coverUrl={coverUrl}
                      tags={tags}
                      totalPartQty={totalPartQty}
                      shortageLineCount={sheet?.shortageLineCount ?? null}
                      shortageTotalQty={sheet?.shortageTotalQty ?? null}
                      shortageClearedAt={sheet?.shortageClearedAt ?? null}
                      gobricksShortageSyncAt={sheet?.gobricksShortageSyncAt ?? null}
                      gobricksGdsPriceCny={sheet?.gobricksGdsPriceCny ?? null}
                      updatedAtIso={updatedAtIso}
                      workflowStage={workflowStage}
                      showInstructionBadge={false}
                      showSourceBadge={false}
                    />
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {data.parts.length > 0 ? (
            <Section
              title="零件"
              moreLink={{
                href: `/parts?q=${encodeURIComponent(qRaw)}`,
                label: "前往零件列表继续搜索",
              }}
            >
              <ul className="tiles-grid" role="list">
                {data.parts.map((h) => (
                  <li key={h.href} className="min-w-0">
                    <PartGridTileLink
                      href={h.href}
                      titleAttr={`${h.title} · ${h.subtitle}`}
                      partNum={h.title}
                      thumbUrl={h.imgUrl}
                      upgradeToPartNum={upgradeMap.get(h.title)}
                      topRight={
                        <span className="absolute left-0.5 top-0.5 z-[2]">
                          <PurchaseListAddToggle
                            partNum={h.title}
                            initialInList={purchasePartNums.has(h.title)}
                            compact
                          />
                        </span>
                      }
                    >
                      {h.subtitle ? (
                        <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-snug text-[var(--muted-2)]">
                          {h.subtitle}
                        </p>
                      ) : null}
                    </PartGridTileLink>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {data.colors.length > 0 ? (
            <Section
              title="颜色"
              moreLink={{
                href: "/colors",
                label: "前往颜色表查看全部（可页内查找）",
              }}
            >
              <ul className="list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="list">
                {data.colors.map((h) => (
                  <ColorSwatchResultCard
                    key={h.href}
                    href={h.href}
                    rgb={h.rgb}
                    title={h.title}
                    subtitle={h.subtitle}
                  />
                ))}
              </ul>
            </Section>
          ) : null}

          {data.elements.length > 0 ? (
            <Section
              title="元素"
              moreLink={{
                href: `/parts?q=${encodeURIComponent(qRaw)}`,
                label: "前往零件列表继续搜索（支持元素编号）",
              }}
            >
              <ul className="tiles-grid" role="list">
                {data.elements.map((h) => {
                  const colorLabel = h.subtitle.includes(" · ")
                    ? h.subtitle.split(" · ").slice(1).join(" · ").trim()
                    : h.subtitle;
                  const titleTip = `${h.title} · ${h.partNum} · ${colorLabel}`;
                  return (
                    <li key={h.href} className="min-w-0">
                      <PartGridTileLink
                        href={h.href}
                        titleAttr={titleTip}
                        partNum={h.partNum}
                        thumbUrl={h.imgUrl}
                        upgradeToPartNum={upgradeMap.get(h.partNum)}
                        topRight={
                          <span className="absolute left-0.5 top-0.5 z-[2]">
                            <PurchaseListAddToggle
                              partNum={h.partNum}
                              initialInList={purchasePartNums.has(h.partNum)}
                              compact
                            />
                          </span>
                        }
                      >
                        <p className="mt-0.5 line-clamp-2 px-0.5 text-center font-mono text-[8px] leading-tight text-[var(--accent)]">
                          {h.title}
                        </p>
                        {colorLabel ? (
                          <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-snug text-[var(--muted-2)]">
                            {colorLabel}
                          </p>
                        ) : null}
                      </PartGridTileLink>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}
