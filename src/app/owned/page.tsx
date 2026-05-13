import Link from "next/link";
import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, min, ne, or } from "drizzle-orm";

import { SavedSubjectListRow } from "@/app/build/saved-subject-list-row";
import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { getDb } from "@/db/client";
import {
  buildImages,
  buildOwnedSubjects,
  buildProfiles,
  buildFavoriteSubjects,
  buildSavedPartsSheets,
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
import { mocListHref } from "@/lib/moc-list-href";
import { parseTagsJson } from "@/lib/moc-profile-parse";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";
import { aggregateOwnedPartInventory } from "@/lib/owned-inventory-aggregate";
import { PART_GRID_TILE_OWNED_HIGHLIGHT } from "@/lib/part-grid-tile-classes";

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
        const m = new Map<
          string,
          { displayName: string; tags: string[]; hasInstructionsPdf: boolean; hasIoSource: boolean }
        >();
        if (mocIds.length === 0) return m;
        const profRows = await db
          .select()
          .from(buildProfiles)
          .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), inArray(buildProfiles.subjectId, mocIds)));
        for (const p of profRows) {
          m.set(p.subjectId, {
            displayName: (p.displayName ?? "").trim(),
            tags: parseTagsJson(p.tagsJson),
            hasInstructionsPdf: Boolean(p.hasInstructionsPdf),
            hasIoSource: Boolean(p.hasIoSource),
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

  const sheetByKindId = new Map<string, { totalPartQty: number; updatedAt: string }>();
  const favoriteMocIds = new Set<string>();
  const favoriteSetNums = new Set<string>();
  const setProfileByNum = new Map<string, { displayName: string; tags: string[] }>();
  const setCoverStored = new Map<string, string>();

  if (mocIds.length > 0 || setNums.length > 0) {
    const sheetOrs = [];
    if (mocIds.length > 0) {
      sheetOrs.push(
        and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC), inArray(buildSavedPartsSheets.subjectId, mocIds)),
      );
    }
    if (setNums.length > 0) {
      sheetOrs.push(
        and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_SET), inArray(buildSavedPartsSheets.subjectId, setNums)),
      );
    }
    const favOrs = [];
    if (mocIds.length > 0) {
      favOrs.push(
        and(eq(buildFavoriteSubjects.subjectKind, BUILD_SUBJECT_MOC), inArray(buildFavoriteSubjects.subjectId, mocIds)),
      );
    }
    if (setNums.length > 0) {
      favOrs.push(
        and(eq(buildFavoriteSubjects.subjectKind, BUILD_SUBJECT_SET), inArray(buildFavoriteSubjects.subjectId, setNums)),
      );
    }

    const [sheetRows, favRows, setProfRows, setImgRows] = await Promise.all([
      sheetOrs.length > 0
        ? db.select().from(buildSavedPartsSheets).where(or(...sheetOrs))
        : Promise.resolve([]),
      favOrs.length > 0
        ? db.select().from(buildFavoriteSubjects).where(or(...favOrs))
        : Promise.resolve([]),
      setNums.length > 0
        ? db
            .select()
            .from(buildProfiles)
            .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_SET), inArray(buildProfiles.subjectId, setNums)))
        : Promise.resolve([]),
      setNums.length > 0
        ? db
            .select({
              subjectId: buildImages.subjectId,
              storedFile: buildImages.storedFile,
              createdAt: buildImages.createdAt,
            })
            .from(buildImages)
            .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_SET), inArray(buildImages.subjectId, setNums)))
            .orderBy(asc(buildImages.createdAt))
        : Promise.resolve([]),
    ]);

    for (const row of sheetRows as { subjectKind: string; subjectId: string; totalPartQty: number; updatedAt: string }[]) {
      sheetByKindId.set(`${row.subjectKind}:${row.subjectId}`, {
        totalPartQty: row.totalPartQty,
        updatedAt: row.updatedAt,
      });
    }
    for (const f of favRows as { subjectKind: string; subjectId: string }[]) {
      if (f.subjectKind === BUILD_SUBJECT_MOC) favoriteMocIds.add(f.subjectId);
      else if (f.subjectKind === BUILD_SUBJECT_SET) favoriteSetNums.add(f.subjectId);
    }
    for (const p of setProfRows as (typeof buildProfiles.$inferSelect)[]) {
      setProfileByNum.set(p.subjectId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
      });
    }
    for (const im of setImgRows as { subjectId: string; storedFile: string }[]) {
      if (!setCoverStored.has(im.subjectId)) setCoverStored.set(im.subjectId, im.storedFile);
    }
  }

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
          <ul className="list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mocRows.map((r) => {
              const prof = mocProfileById.get(r.subjectId);
              const displayName = prof?.displayName?.trim() ?? "";
              const title = displayName || `MOC ${r.subjectId}`;
              const tags = prof?.tags ?? [];
              const stored = mocCoverStored.get(r.subjectId);
              const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, r.subjectId, stored) : null;
              const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_MOC, r.subjectId);
              const sheet = sheetByKindId.get(`${BUILD_SUBJECT_MOC}:${r.subjectId}`);
              const totalPartQty = sheet?.totalPartQty ?? 0;
              const updatedAtIso = sheet?.updatedAt ?? r.markedAt;
              return (
                <SavedSubjectListRow
                  key={`moc-${r.subjectId}`}
                  kind={BUILD_SUBJECT_MOC}
                  subjectId={r.subjectId}
                  detailHref={detailHref}
                  title={title}
                  coverUrl={uploadCoverUrl}
                  tags={tags}
                  mocTagHref={(tag) => mocListHref({ tag })}
                  totalPartQty={totalPartQty}
                  updatedAtIso={updatedAtIso}
                  owned={true}
                  favorite={favoriteMocIds.has(r.subjectId)}
                  showInstructionBadge={Boolean(prof?.hasInstructionsPdf)}
                  showSourceBadge={Boolean(prof?.hasIoSource)}
                />
              );
            })}
          </ul>
        </section>
      ) : null}

      {setRows.length > 0 ? (
        <section className="section-panel owned-category">
          <h2 className="section-title mb-4 text-[var(--text)]">套装（{setRows.length.toLocaleString("zh-CN")}）</h2>
          <ul className="list-cards-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {setRows.map((r) => {
              const prof = setProfileByNum.get(r.subjectId);
              const displayName = prof?.displayName?.trim() ?? "";
              const catalogName = setNameByNum.get(r.subjectId) ?? "";
              const title = displayName || catalogName || `套装 ${r.subjectId}`;
              const tags = prof?.tags ?? [];
              const officialUrl = setHeroByNum.get(r.subjectId) ?? null;
              const stored = setCoverStored.get(r.subjectId);
              const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_SET, r.subjectId, stored) : null;
              const coverUrl =
                (officialUrl && officialUrl.length > 0 ? officialUrl : null) ?? uploadCoverUrl ?? null;
              const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, r.subjectId);
              const sheet = sheetByKindId.get(`${BUILD_SUBJECT_SET}:${r.subjectId}`);
              const totalPartQty = sheet?.totalPartQty ?? 0;
              const updatedAtIso = sheet?.updatedAt ?? r.markedAt;
              return (
                <SavedSubjectListRow
                  key={`set-${r.subjectId}`}
                  kind={BUILD_SUBJECT_SET}
                  subjectId={r.subjectId}
                  detailHref={detailHref}
                  title={title}
                  coverUrl={coverUrl}
                  tags={tags}
                  totalPartQty={totalPartQty}
                  updatedAtIso={updatedAtIso}
                  owned={true}
                  favorite={favoriteSetNums.has(r.subjectId)}
                  showInstructionBadge={false}
                  showSourceBadge={false}
                />
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
                  <PartGridTileLink
                    href={detailHref}
                    titleAttr={`${title} · 散装 ×${qty} · 标记 ${formatMarkedAt(r.markedAt)}`}
                    partNum={partNum}
                    thumbUrl={thumb}
                    isPrinted={isPrinted}
                    extraTileClass={PART_GRID_TILE_OWNED_HIGHLIGHT}
                    topRight={
                      <span
                        className="pointer-events-none absolute right-1 top-1 z-[2] rounded border border-white/15 bg-black/70 px-1 py-px text-[10px] font-semibold tabular-nums leading-none text-white shadow-sm"
                        aria-label={`拥有数量 ${qty}`}
                      >
                        {qty.toLocaleString("zh-CN")}
                      </span>
                    }
                  >
                    {colorCount > 0 || elemCount > 0 ? (
                      <p className="mt-0.5 truncate px-0.5 text-center text-[9px] tabular-nums text-[var(--muted-2)]">
                        {colorCount > 0 ? `${colorCount} 色` : null}
                        {colorCount > 0 && elemCount > 0 ? " · " : null}
                        {elemCount > 0 ? `${elemCount} 元素` : null}
                      </p>
                    ) : null}
                  </PartGridTileLink>
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
                      <PartGridTileLink
                        href={detailHref}
                        titleAttr={titleTip}
                        partNum={row.partNum}
                        thumbUrl={thumb}
                        extraTileClass={PART_GRID_TILE_OWNED_HIGHLIGHT}
                        topRight={
                          <span
                            className="pointer-events-none absolute right-1 top-1 z-[2] rounded border border-white/15 bg-black/70 px-1 py-px text-[10px] font-semibold tabular-nums leading-none text-white shadow-sm"
                            aria-label={`合计 ${row.totalQty}`}
                          >
                            {row.totalQty.toLocaleString("zh-CN")}
                          </span>
                        }
                      />
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
