import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import { runGlobalSearch } from "@/lib/global-search-server";
import type { GlobalSearchColorHit } from "@/lib/global-search-types";
import { likeFragment } from "@/lib/search";

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
      <div className="search-results-section-body">
        {children}
      </div>
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

function thumbSizes() {
  return "(max-width: 560px) 100vw, (max-width: 1100px) 50vw, 33vw";
}

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function PartSearchTile({
  href,
  partNum,
  name,
  imgUrl,
}: {
  href: string;
  partNum: string;
  name: string;
  imgUrl: string | null | undefined;
}) {
  const title = `${partNum} · ${name}`;
  return (
    <li className="min-w-0">
      <Link href={href} className="parts-search-tile block text-inherit no-underline" title={title}>
        <div className="parts-search-thumb relative">
          {usableImgUrl(imgUrl) ? (
            <RemoteCoverImage
              src={imgUrl.trim()}
              fill
              className="object-contain p-0.5"
              sizes="(max-width:640px)20vw,4.5rem"
              alt=""
              fallbackLabel="无图"
              fallbackClassName="text-[9px]"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--muted)]">
              无图
            </span>
          )}
        </div>
        <p className="parts-search-part-num">{partNum}</p>
        <p className="parts-search-meta">{name}</p>
      </Link>
    </li>
  );
}

function ElementSearchTile({
  href,
  elementId,
  partNum,
  subtitle,
  imgUrl,
}: {
  href: string;
  elementId: string;
  partNum: string;
  subtitle: string;
  imgUrl: string | null | undefined;
}) {
  const colorLabel =
    subtitle.includes(" · ") ? subtitle.split(" · ").slice(1).join(" · ").trim() : subtitle;
  const title = `${elementId} · ${partNum} · ${colorLabel}`;
  return (
    <li className="min-w-0">
      <Link href={href} className="parts-search-tile block text-inherit no-underline" title={title}>
        <div className="parts-search-thumb relative">
          {usableImgUrl(imgUrl) ? (
            <RemoteCoverImage
              src={imgUrl.trim()}
              fill
              className="object-contain p-0.5"
              sizes="(max-width:640px)20vw,4.5rem"
              alt=""
              fallbackLabel="无图"
              fallbackClassName="text-[9px]"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--muted)]">
              无图
            </span>
          )}
        </div>
        <p className="parts-search-part-num">{partNum}</p>
        <p className="parts-search-element-id">{elementId}</p>
        {colorLabel ? <p className="parts-search-meta">{colorLabel}</p> : null}
      </Link>
    </li>
  );
}

function HitCard({
  href,
  media,
  kicker,
  title,
  titleMono,
  meta,
}: {
  href: string;
  media: ReactNode;
  kicker?: string;
  title: string;
  titleMono?: boolean;
  meta: string;
}) {
  return (
    <li className="min-w-0">
      <Link href={href} className="search-hit-card">
        <div className="search-hit-card-media">{media}</div>
        <div className="search-hit-card-body">
          {kicker ? <p className="search-hit-card-kicker">{kicker}</p> : null}
          <p
            className={`search-hit-card-title line-clamp-2 ${titleMono ? "font-mono text-[0.9rem] tracking-tight" : ""}`}
          >
            {title}
          </p>
          <p className="search-hit-card-meta line-clamp-2">{meta}</p>
        </div>
      </Link>
    </li>
  );
}

function ColorHitCard({ h }: { h: GlobalSearchColorHit }) {
  return (
    <li className="min-w-0">
      <Link href={h.href} className="search-hit-card">
        <div
          className="search-hit-card-media search-hit-card-media-swatch"
          style={{ background: `#${h.rgb}` }}
          aria-hidden
        />
        <div className="search-hit-card-body">
          <p className="search-hit-card-title line-clamp-2">{h.title}</p>
          <p className="search-hit-card-meta font-mono text-[0.72rem]">{h.subtitle}</p>
        </div>
      </Link>
    </li>
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
              <ul className="search-results-grid">
                {data.mocs.map((h) => (
                  <HitCard
                    key={h.href}
                    href={h.href}
                    kicker="MOC"
                    title={h.title}
                    meta={h.subtitle}
                    media={
                      <RemoteCoverImage
                        src={(h.imgUrl ?? "").trim()}
                        fill
                        className="object-contain p-3"
                        sizes={thumbSizes()}
                        alt=""
                        fallbackLabel="MOC"
                        fallbackClassName="text-sm font-bold text-[var(--muted-2)]"
                      />
                    }
                  />
                ))}
              </ul>
            </Section>
          ) : null}

          {data.sets.length > 0 ? (
            <Section
              title="套装"
              moreLink={{
                href: `/sets?q=${encodeURIComponent(qRaw)}`,
                label: "前往套装页继续筛选（官方目录 + 已存零件表）",
              }}
            >
              <ul className="search-results-grid">
                {data.sets.map((h) => (
                  <HitCard
                    key={h.href}
                    href={h.href}
                    kicker="套装"
                    title={h.title}
                    titleMono
                    meta={h.subtitle}
                    media={
                      <RemoteCoverImage
                        src={(h.imgUrl ?? "").trim()}
                        fill
                        className="object-contain p-3"
                        sizes={thumbSizes()}
                        alt=""
                        fallbackLabel="套"
                        fallbackClassName="text-sm font-bold text-[var(--muted-2)]"
                      />
                    }
                  />
                ))}
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
              <ul className="parts-search-grid">
                {data.parts.map((h) => (
                  <PartSearchTile
                    key={h.href}
                    href={h.href}
                    partNum={h.title}
                    name={h.subtitle}
                    imgUrl={h.imgUrl}
                  />
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
              <ul className="search-results-grid">
                {data.colors.map((h) => (
                  <ColorHitCard key={h.href} h={h} />
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
              <ul className="parts-search-grid">
                {data.elements.map((h) => (
                  <ElementSearchTile
                    key={h.href}
                    href={h.href}
                    elementId={h.title}
                    partNum={h.partNum}
                    subtitle={h.subtitle}
                    imgUrl={h.imgUrl}
                  />
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}
