import Link from "next/link";
import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, min, ne } from "drizzle-orm";

import { BuildOwnedToggle } from "@/app/build/build-owned-toggle";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { getDb } from "@/db/client";
import {
  buildImages,
  buildOwnedSubjects,
  buildProfiles,
  elements,
  inventoryParts,
  legoSets,
  partRelationships,
  parts,
} from "@/db/schema";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { OWNED_SUBJECT_PART } from "@/lib/build-owned-subject";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { parseTagsJson } from "@/lib/moc-profile-parse";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";
import { aggregateOwnedPartInventory } from "@/lib/owned-inventory-aggregate";
import { PART_GRID_TILE_CLASS_BASE, PART_GRID_TILE_OWNED_HIGHLIGHT } from "@/lib/part-grid-tile-classes";

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
    if (r.subjectKind === BUILD_SUBJECT_MOC) mocRows.push(r);
    else if (r.subjectKind === BUILD_SUBJECT_SET) setRows.push(r);
    else if (r.subjectKind === OWNED_SUBJECT_PART) partRows.push(r);
  }

  const setNums = setRows.map((r) => r.subjectId);
  const mocIds = mocRows.map((r) => r.subjectId);
  const partNums = partRows.map((r) => r.subjectId);

  const [setNameByNum, setHeroByNum, mocProfileById, mocCoverStored, partNameByNum, partThumbByNum, partListMeta] =
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
      (async () => {
        if (partNums.length === 0) {
          return {
            elemCountByPart: new Map<string, number>(),
            colorCountByPart: new Map<string, number>(),
            printedPartNums: new Set<string>(),
          };
        }
        const [ecRows, ccRows, prRows] = await Promise.all([
          db
            .select({
              partNum: elements.partNum,
              n: count(elements.elementId),
            })
            .from(elements)
            .where(inArray(elements.partNum, partNums))
            .groupBy(elements.partNum),
          db
            .select({
              partNum: elements.partNum,
              n: countDistinct(elements.colorId),
            })
            .from(elements)
            .where(inArray(elements.partNum, partNums))
            .groupBy(elements.partNum),
          db
            .select({ partNum: partRelationships.childPartNum })
            .from(partRelationships)
            .where(
              and(
                eq(partRelationships.relType, "P"),
                inArray(partRelationships.childPartNum, partNums)
              )
            )
            .groupBy(partRelationships.childPartNum),
        ]);
        const elemCountByPart = new Map<string, number>();
        for (const row of ecRows) elemCountByPart.set(row.partNum, Number(row.n));
        const colorCountByPart = new Map<string, number>();
        for (const row of ccRows) colorCountByPart.set(row.partNum, Number(row.n));
        const printedPartNums = new Set<string>();
        for (const row of prRows) printedPartNums.add(row.partNum);
        return { elemCountByPart, colorCountByPart, printedPartNums };
      })(),
    ]);

  const { elemCountByPart, colorCountByPart, printedPartNums } = partListMeta;

  const total = setRows.length + mocRows.length + partRows.length;

  const { rows: invAggRows, truncated: invAggTruncated } =
    total > 0 ? await aggregateOwnedPartInventory() : { rows: [], truncated: false };
  const invAggPartNums = invAggRows.map((r) => r.partNum);
  const invAggNameByNum = new Map<string, string>();
  const invAggThumbByNum = new Map<string, string>();
  if (invAggPartNums.length > 0) {
    const [pr, thumbRows] = await Promise.all([
      db
        .select({ partNum: parts.partNum, name: parts.name })
        .from(parts)
        .where(inArray(parts.partNum, invAggPartNums)),
      db
        .select({ partNum: inventoryParts.partNum, thumb: min(inventoryParts.imgUrl) })
        .from(inventoryParts)
        .where(
          and(
            inArray(inventoryParts.partNum, invAggPartNums),
            isNotNull(inventoryParts.imgUrl),
            ne(inventoryParts.imgUrl, "")
          )
        )
        .groupBy(inventoryParts.partNum),
    ]);
    for (const p of pr) invAggNameByNum.set(p.partNum, (p.name ?? "").trim());
    for (const t of thumbRows) {
      if (t.thumb && usableImgUrl(t.thumb)) invAggThumbByNum.set(t.partNum, t.thumb.trim());
    }
  }

  const partTileOwnedClass = `${PART_GRID_TILE_CLASS_BASE} ${PART_GRID_TILE_OWNED_HIGHLIGHT}`;

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">本地收藏</p>
        <h1 className="page-title">我的拥有</h1>
        <p className="page-description">
          汇总在 MOC、套装与零件详情页标记为「拥有」的项目（数据存于本地 SQLite）。散装零件可填写数量；已拥有套装与
          MOC 会按官方库存或已存零件表计入页面底部「零件数量汇总」，并在对应详情页的零件表上以拥有样式高亮显示。共{" "}
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
          <ul className="owned-grid list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <ul className="owned-grid list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <p className="mb-3 text-sm text-[var(--muted)]">
            与{" "}
            <Link href="/parts?cat=all" className="text-[var(--accent)] underline underline-offset-2">
              零件列表
            </Link>{" "}
            相同的方格缩略图；右上角数字为散装拥有数量，修改请打开零件详情页。
          </p>
          <ul className="tiles-grid" role="list">
            {partRows.map((r) => {
              const partNum = r.subjectId;
              const name = partNameByNum.get(partNum) ?? "";
              const thumb = partThumbByNum.get(partNum) ?? null;
              const detailHref = `/parts/${encodeURIComponent(partNum)}`;
              const qty =
                typeof r.quantity === "number" && Number.isFinite(r.quantity)
                  ? Math.max(1, Math.floor(r.quantity))
                  : 1;
              const elemCount = elemCountByPart.get(partNum) ?? 0;
              const colorCount = colorCountByPart.get(partNum) ?? 0;
              const isPrinted = printedPartNums.has(partNum);
              const title = [
                partNum,
                name,
                isPrinted ? "印刷件" : "普通零件",
                colorCount > 0 ? `${colorCount} 色` : null,
                elemCount > 0 ? `${elemCount} 元素` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={`part-${partNum}`} className="min-w-0">
                  <Link
                    href={detailHref}
                    className={`${partTileOwnedClass} block text-inherit no-underline`}
                    title={`${title} · 散装 ×${qty} · 标记 ${formatMarkedAt(r.markedAt)}`}
                  >
                    <span
                      className="pointer-events-none absolute right-1 top-1 z-[2] rounded border border-white/15 bg-black/70 px-1 py-px text-[10px] font-semibold tabular-nums leading-none text-white shadow-sm"
                      aria-label={`拥有数量 ${qty}`}
                    >
                      {qty.toLocaleString("zh-CN")}
                    </span>
                    {isPrinted ? (
                      <span className="pointer-events-none absolute left-1 top-1 z-[1] max-w-[45%] truncate text-[9px] font-medium leading-none text-orange-300/95">
                        印刷
                      </span>
                    ) : null}
                    <div className="relative mx-auto mt-3 aspect-square w-[calc(100%-0.25rem)] max-w-[4.5rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
                      {usableImgUrl(thumb) ? (
                        <RemoteCoverImage
                          src={thumb.trim()}
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
                    <p className="mt-1 truncate px-0.5 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                      {partNum}
                    </p>
                    {colorCount > 0 || elemCount > 0 ? (
                      <p className="mt-0.5 truncate px-0.5 text-center text-[9px] tabular-nums text-[var(--muted-2)]">
                        {colorCount > 0 ? `${colorCount} 色` : null}
                        {colorCount > 0 && elemCount > 0 ? " · " : null}
                        {elemCount > 0 ? `${elemCount} 元素` : null}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {total > 0 ? (
        <section className="section-panel owned-category">
          <h2 className="section-title mb-2 text-[var(--text)]">零件数量汇总</h2>
          <p className="mb-3 text-sm leading-relaxed text-[var(--muted)]">
            散装登记数量，加上已拥有套装（优先本地 Rebrickable 官方 inventory；若无库存行则使用已上传套装零件表）与
            MOC（已存完整表优先，否则缺件表）中的零件数量，按零件号合并。下方为与零件列表相同的方格缩略图，右上角数字为合计数量；悬停可看名称与散装 / 套装 / MOC 分项。
          </p>
          {invAggRows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              当前无可用行：请为已拥有的 MOC 上传零件表 CSV，或确认套装在本地库中有 inventory；亦可单独在零件页登记散装数量。
            </p>
          ) : (
            <>
              <ul className="tiles-grid" role="list">
                {invAggRows.map((row) => {
                  const nm = invAggNameByNum.get(row.partNum) ?? "";
                  const thumb = invAggThumbByNum.get(row.partNum) ?? null;
                  const detailHref = `/parts/${encodeURIComponent(row.partNum)}`;
                  const titleTip = [
                    row.partNum,
                    nm || null,
                    `合计 ${row.totalQty.toLocaleString("zh-CN")}`,
                    `散装 ${row.looseQty.toLocaleString("zh-CN")}`,
                    `套装 ${row.fromSetQty.toLocaleString("zh-CN")}`,
                    `MOC ${row.fromMocQty.toLocaleString("zh-CN")}`,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li key={`agg-${row.partNum}`} className="min-w-0">
                      <Link
                        href={detailHref}
                        className={`${partTileOwnedClass} block text-inherit no-underline`}
                        title={titleTip}
                      >
                        <span
                          className="pointer-events-none absolute right-1 top-1 z-[2] rounded border border-white/15 bg-black/70 px-1 py-px text-[10px] font-semibold tabular-nums leading-none text-white shadow-sm"
                          aria-label={`合计 ${row.totalQty}`}
                        >
                          {row.totalQty.toLocaleString("zh-CN")}
                        </span>
                        <div className="relative mx-auto mt-3 aspect-square w-[calc(100%-0.25rem)] max-w-[4.5rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
                          {usableImgUrl(thumb) ? (
                            <RemoteCoverImage
                              src={thumb.trim()}
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
                        <p className="mt-1 truncate px-0.5 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
                          {row.partNum}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {invAggTruncated ? (
                <p className="mt-3 text-xs text-[var(--muted)]">仅展示前 500 个零件号，其余已省略。</p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
