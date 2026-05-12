import Link from "next/link";
import { and, asc, desc, eq, inArray, isNotNull, min, ne } from "drizzle-orm";

import { BuildOwnedToggle } from "@/app/build/build-owned-toggle";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { getDb } from "@/db/client";
import {
  buildImages,
  buildOwnedSubjects,
  buildProfiles,
  inventoryParts,
  legoSets,
  parts,
} from "@/db/schema";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { OWNED_SUBJECT_PART } from "@/lib/build-owned-subject";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { parseTagsJson } from "@/lib/moc-profile-parse";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";

export const dynamic = "force-dynamic";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function formatMarkedAt(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}

export default async function OwnedCollectionPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(buildOwnedSubjects)
    .orderBy(desc(buildOwnedSubjects.markedAt));

  const setRows: typeof rows = [];
  const mocRows: typeof rows = [];
  const partRows: typeof rows = [];
  for (const r of rows) {
    if (r.subjectKind === BUILD_SUBJECT_SET) setRows.push(r);
    else if (r.subjectKind === BUILD_SUBJECT_MOC) mocRows.push(r);
    else if (r.subjectKind === OWNED_SUBJECT_PART) partRows.push(r);
  }

  const setNums = setRows.map((r) => r.subjectId);
  const mocIds = mocRows.map((r) => r.subjectId);
  const partNums = partRows.map((r) => r.subjectId);

  const [setNameByNum, setHeroByNum, mocProfileById, mocCoverStored, partNameByNum, partThumbByNum] =
    await Promise.all([
      (async () => {
        const m = new Map<string, string>();
        if (setNums.length === 0) return m;
        const cat = await db
          .select({ setNum: legoSets.setNum, name: legoSets.name })
          .from(legoSets)
          .where(inArray(legoSets.setNum, setNums));
        for (const c of cat) {
          if (c.setNum) m.set(c.setNum, (c.name ?? "").trim());
        }
        return m;
      })(),
      setNums.length > 0 ? batchSetCatalogHeroUrls(setNums) : Promise.resolve(new Map<string, string | null>()),
      (async () => {
        const m = new Map<string, { displayName: string; tags: string[] }>();
        if (mocIds.length === 0) return m;
        const profRows = await db
          .select()
          .from(buildProfiles)
          .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), inArray(buildProfiles.subjectId, mocIds)));
        for (const p of profRows) {
          m.set(p.subjectId, {
            displayName: (p.displayName ?? "").trim(),
            tags: parseTagsJson(p.tagsJson),
          });
        }
        return m;
      })(),
      (async () => {
        const m = new Map<string, string>();
        if (mocIds.length === 0) return m;
        const imgs = await db
          .select({
            subjectId: buildImages.subjectId,
            storedFile: buildImages.storedFile,
            createdAt: buildImages.createdAt,
          })
          .from(buildImages)
          .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), inArray(buildImages.subjectId, mocIds)))
          .orderBy(asc(buildImages.createdAt));
        for (const im of imgs) {
          if (!m.has(im.subjectId)) m.set(im.subjectId, im.storedFile);
        }
        return m;
      })(),
      (async () => {
        const m = new Map<string, string>();
        if (partNums.length === 0) return m;
        const pr = await db
          .select({ partNum: parts.partNum, name: parts.name })
          .from(parts)
          .where(inArray(parts.partNum, partNums));
        for (const p of pr) m.set(p.partNum, (p.name ?? "").trim());
        return m;
      })(),
      (async () => {
        const m = new Map<string, string>();
        if (partNums.length === 0) return m;
        const imgClause = and(
          inArray(inventoryParts.partNum, partNums),
          isNotNull(inventoryParts.imgUrl),
          ne(inventoryParts.imgUrl, "")
        );
        const thumbRows = await db
          .select({ partNum: inventoryParts.partNum, thumb: min(inventoryParts.imgUrl) })
          .from(inventoryParts)
          .where(imgClause)
          .groupBy(inventoryParts.partNum);
        for (const t of thumbRows) {
          if (t.thumb && usableImgUrl(t.thumb)) m.set(t.partNum, t.thumb.trim());
        }
        return m;
      })(),
    ]);

  const total = setRows.length + mocRows.length + partRows.length;

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">本地收藏</p>
        <h1 className="page-title">我的拥有</h1>
        <p className="page-description">
          汇总在套装、MOC 与零件详情页标记为「拥有」的项目（数据存于本地 SQLite）。共{" "}
          <strong className="font-medium text-[var(--text)]">{total.toLocaleString("zh-CN")}</strong>{" "}
          条：MOC {mocRows.length.toLocaleString("zh-CN")} · 套装 {setRows.length.toLocaleString("zh-CN")} · 零件{" "}
          {partRows.length.toLocaleString("zh-CN")}。
        </p>
      </section>

      {total === 0 ? (
        <section className="section-panel">
          <p className="text-sm text-[var(--muted)]">
            尚无记录。打开任意{" "}
            <Link href="/mocs" className="text-[var(--accent)] underline underline-offset-2">
              MOC
            </Link>
            、
            <Link href="/sets" className="text-[var(--accent)] underline underline-offset-2">
              套装
            </Link>{" "}
            或{" "}
            <Link href="/parts" className="text-[var(--accent)] underline underline-offset-2">
              零件
            </Link>{" "}
            详情页，点击圆形「+」按钮即可加入此处。
          </p>
        </section>
      ) : null}

      {mocRows.length > 0 ? (
        <section className="section-panel owned-category">
          <h2 className="section-title mb-4 text-[var(--text)]">MOC（{mocRows.length.toLocaleString("zh-CN")}）</h2>
          <ul className="owned-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mocRows.map((r) => {
              const prof = mocProfileById.get(r.subjectId);
              const displayName = prof?.displayName?.trim() ?? "";
              const title = displayName || `MOC ${r.subjectId}`;
              const tags = prof?.tags ?? [];
              const stored = mocCoverStored.get(r.subjectId);
              const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, r.subjectId, stored) : null;
              const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_MOC, r.subjectId);
              return (
                <li key={`moc-${r.subjectId}`} className="result-card flex flex-col gap-0 overflow-hidden p-0">
                  <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]">
                    <Link href={detailHref} className="absolute inset-0 z-0 block" aria-label={`${title} 封面`}>
                      {uploadCoverUrl ? (
                        <RemoteCoverImage
                          src={uploadCoverUrl}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          alt=""
                          fallbackLabel="无参考图"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
                          无参考图
                        </span>
                      )}
                    </Link>
                    <div className="pointer-events-none absolute right-2 top-2 z-10">
                      <div className="pointer-events-auto">
                        <BuildOwnedToggle
                          subjectKind={BUILD_SUBJECT_MOC}
                          subjectId={r.subjectId}
                          initialOwned={true}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
                    <div className="min-w-0">
                      <Link
                        href={detailHref}
                        className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 truncate font-mono text-xs text-[var(--muted)]" title={r.subjectId}>
                        {r.subjectId}
                      </p>
                    </div>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t, i) => (
                          <span
                            key={`${r.subjectId}-${t}-${i}`}
                            className="rounded border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text)]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-auto border-t border-[var(--border-soft)] pt-2.5 text-xs tabular-nums text-[var(--muted)]">
                      <span className="text-[var(--muted-2)]">标记时间 </span>
                      <time dateTime={r.markedAt}>{formatMarkedAt(r.markedAt)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {setRows.length > 0 ? (
        <section className="section-panel owned-category">
          <h2 className="section-title mb-4 text-[var(--text)]">套装（{setRows.length.toLocaleString("zh-CN")}）</h2>
          <ul className="owned-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {setRows.map((r) => {
              const catalogName = setNameByNum.get(r.subjectId) ?? "";
              const title = catalogName || `套装 ${r.subjectId}`;
              const officialUrl = setHeroByNum.get(r.subjectId) ?? null;
              const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, r.subjectId);
              return (
                <li key={`set-${r.subjectId}`} className="result-card flex flex-col gap-0 overflow-hidden p-0">
                  <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]">
                    <Link href={detailHref} className="absolute inset-0 z-0 block" aria-label={`${title} 封面`}>
                      {officialUrl ? (
                        <RemoteCoverImage
                          src={officialUrl}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          alt=""
                          fallbackLabel="无官方图"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
                          无官方图
                        </span>
                      )}
                    </Link>
                    <div className="pointer-events-none absolute right-2 top-2 z-10">
                      <div className="pointer-events-auto">
                        <BuildOwnedToggle
                          subjectKind={BUILD_SUBJECT_SET}
                          subjectId={r.subjectId}
                          initialOwned={true}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
                    <div className="min-w-0">
                      <Link
                        href={detailHref}
                        className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 truncate font-mono text-xs text-[var(--muted)]" title={r.subjectId}>
                        {r.subjectId}
                      </p>
                    </div>
                    <p className="mt-auto border-t border-[var(--border-soft)] pt-2.5 text-xs tabular-nums text-[var(--muted)]">
                      <span className="text-[var(--muted-2)]">标记时间 </span>
                      <time dateTime={r.markedAt}>{formatMarkedAt(r.markedAt)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {partRows.length > 0 ? (
        <section className="section-panel owned-category">
          <h2 className="section-title mb-4 text-[var(--text)]">零件（{partRows.length.toLocaleString("zh-CN")}）</h2>
          <ul className="owned-grid grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {partRows.map((r) => {
              const name = partNameByNum.get(r.subjectId) ?? "";
              const title = name || `零件 ${r.subjectId}`;
              const thumb = partThumbByNum.get(r.subjectId) ?? null;
              const detailHref = `/parts/${encodeURIComponent(r.subjectId)}`;
              return (
                <li key={`part-${r.subjectId}`} className="result-card flex flex-col gap-0 overflow-hidden p-0">
                  <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]">
                    <Link href={detailHref} className="absolute inset-0 z-0 block" aria-label={`${title} 图示`}>
                      {thumb ? (
                        <RemoteCoverImage
                          src={thumb}
                          fill
                          className="object-contain p-3"
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                          alt=""
                          fallbackLabel="无图"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
                          无图
                        </span>
                      )}
                    </Link>
                    <div className="pointer-events-none absolute right-2 top-2 z-10">
                      <div className="pointer-events-auto">
                        <BuildOwnedToggle
                          subjectKind={OWNED_SUBJECT_PART}
                          subjectId={r.subjectId}
                          initialOwned={true}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
                    <div className="min-w-0">
                      <Link
                        href={detailHref}
                        className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 truncate font-mono text-xs text-[var(--muted)]" title={r.subjectId}>
                        {r.subjectId}
                      </p>
                    </div>
                    <p className="mt-auto border-t border-[var(--border-soft)] pt-2.5 text-xs tabular-nums text-[var(--muted)]">
                      <span className="text-[var(--muted-2)]">标记时间 </span>
                      <time dateTime={r.markedAt}>{formatMarkedAt(r.markedAt)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
