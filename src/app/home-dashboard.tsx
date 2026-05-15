import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { SavedSubjectListRow } from "@/app/build/saved-subject-list-row";
import { HomeListStrip } from "@/app/home-list-strip";
import { HomeMyFavoriteTabs, type HomeMyFavoriteDefaultTab } from "@/app/home-my-favorite-tabs";
import { getCatalogDb, getUserDb } from "@/db/client";
import {
  buildFavoriteSubjects,
  buildImages,
  buildOwnedSubjects,
  buildProfiles,
  buildSavedPartsSheets,
  inventories,
  inventoryParts,
  legoSets,
} from "@/db/schema";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { mocListHref } from "@/lib/moc-list-href";
import { parseTagsJson } from "@/lib/moc-profile-parse";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";

export const dynamic = "force-dynamic";

const HOME_PREVIEW_MAX = 4;
const PREVIEW_SUBJECT_LI = "min-w-0";

function pickHomeDefaultTab(ownedCount: number, favCount: number): HomeMyFavoriteDefaultTab {
  if (ownedCount > 0) return "my";
  if (favCount > 0) return "favorite";
  return "my";
}

type SheetMeta = {
  totalPartQty: number;
  updatedAt: string;
  shortageLineCount: number | null;
  shortageTotalQty: number | null;
  shortageClearedAt: string | null;
  gobricksShortageSyncAt: string | null;
  gobricksGdsPriceCny: number | null;
};

function emptyTabHint(kind: "moc" | "set", tab: "my" | "favorite"): string {
  if (kind === "moc") {
    return tab === "my"
      ? "暂无已拥有的 MOC。在 MOC 详情页点击「+」即可标记拥有；更多条目请用顶部搜索或 MOC 目录（已拥有筛选仅含已存零件表）。"
      : "暂无收藏的 MOC。在详情页点击星标即可收藏；MOC 目录中的「已收藏」筛选仅含已保存零件表的条目。";
  }
  return tab === "my"
    ? "暂无已拥有的套装。在套装详情或官方目录卡片上标记拥有即可。"
    : "暂无收藏的套装。在套装详情或官方目录卡片上加入收藏即可。";
}

/** MOC：我的 / 收藏 两个 Tab */
export async function HomeMocBlock() {
  const userDb = getUserDb();

  const [ownedAll, favAll] = await Promise.all([
    userDb
      .select()
      .from(buildOwnedSubjects)
      .where(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_MOC))
      .orderBy(desc(buildOwnedSubjects.markedAt)),
    userDb
      .select()
      .from(buildFavoriteSubjects)
      .where(eq(buildFavoriteSubjects.subjectKind, BUILD_SUBJECT_MOC))
      .orderBy(desc(buildFavoriteSubjects.markedAt)),
  ]);

  const ownedPreview = ownedAll.slice(0, HOME_PREVIEW_MAX);
  const favPreview = favAll.slice(0, HOME_PREVIEW_MAX);
  const enrichIds = [...new Set([...ownedPreview.map((r) => r.subjectId), ...favPreview.map((r) => r.subjectId)])];

  const mocProfileById = new Map<
    string,
    { displayName: string; tags: string[]; hasInstructionsPdf: boolean; hasIoSource: boolean }
  >();
  const mocCoverStored = new Map<string, string>();
  const sheetByKindId = new Map<string, SheetMeta>();
  const mocMarkedAt = new Map<string, string>();
  for (const r of favAll) mocMarkedAt.set(r.subjectId, r.markedAt);

  if (enrichIds.length > 0) {
    const [profRows, imgRows, sheetRows] = await Promise.all([
      userDb
        .select()
        .from(buildProfiles)
        .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC), inArray(buildProfiles.subjectId, enrichIds))),
      userDb
        .select({
          subjectId: buildImages.subjectId,
          storedFile: buildImages.storedFile,
          createdAt: buildImages.createdAt,
        })
        .from(buildImages)
        .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), inArray(buildImages.subjectId, enrichIds)))
        .orderBy(asc(buildImages.createdAt)),
      userDb
        .select()
        .from(buildSavedPartsSheets)
        .where(and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC), inArray(buildSavedPartsSheets.subjectId, enrichIds))),
    ]);
    for (const p of profRows) {
      mocProfileById.set(p.subjectId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
        hasInstructionsPdf: Boolean(p.hasInstructionsPdf),
        hasIoSource: Boolean(p.hasIoSource),
      });
    }
    for (const im of imgRows) {
      if (!mocCoverStored.has(im.subjectId)) mocCoverStored.set(im.subjectId, im.storedFile);
    }
    for (const row of sheetRows) {
      sheetByKindId.set(`${BUILD_SUBJECT_MOC}:${row.subjectId}`, {
        totalPartQty: row.totalPartQty,
        updatedAt: row.updatedAt,
        shortageLineCount: row.shortageLineCount ?? null,
        shortageTotalQty: row.shortageTotalQty ?? null,
        shortageClearedAt: row.shortageClearedAt ?? null,
        gobricksShortageSyncAt: row.gobricksShortageSyncAt ?? null,
        gobricksGdsPriceCny:
          typeof row.gobricksGdsPriceCny === "number" && Number.isFinite(row.gobricksGdsPriceCny)
            ? row.gobricksGdsPriceCny
            : null,
      });
    }
  }

  const ownedPreviewIds = ownedPreview.map((r) => r.subjectId);
  const favPreviewIds = favPreview.map((r) => r.subjectId);
  const favoriteForOwnedPreview = new Set<string>();
  const ownedForFavPreview = new Set<string>();
  if (ownedPreviewIds.length > 0) {
    const fr = await userDb
      .select()
      .from(buildFavoriteSubjects)
      .where(
        and(eq(buildFavoriteSubjects.subjectKind, BUILD_SUBJECT_MOC), inArray(buildFavoriteSubjects.subjectId, ownedPreviewIds)),
      );
    for (const r of fr) favoriteForOwnedPreview.add(r.subjectId);
  }
  if (favPreviewIds.length > 0) {
    const orows = await userDb
      .select()
      .from(buildOwnedSubjects)
      .where(and(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_MOC), inArray(buildOwnedSubjects.subjectId, favPreviewIds)));
    for (const r of orows) ownedForFavPreview.add(r.subjectId);
  }

  const myPanel =
    ownedAll.length > 0 ? (
      <HomeListStrip
        heading="MOC"
        total={ownedAll.length}
        moreHref={mocListHref({ mark: "owned" })}
        moreLabel="MOC 目录 · 已拥有（仅已存零件表）"
        previewCap={HOME_PREVIEW_MAX}
        hideCategoryTitle
      >
        {ownedPreview.map((r) => {
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
              key={`moc-my-${r.subjectId}`}
              className={PREVIEW_SUBJECT_LI}
              kind={BUILD_SUBJECT_MOC}
              subjectId={r.subjectId}
              detailHref={detailHref}
              title={title}
              coverUrl={uploadCoverUrl}
              tags={tags}
              mocTagHref={(tag) => mocListHref({ tag })}
              totalPartQty={totalPartQty}
              shortageLineCount={sheet?.shortageLineCount ?? null}
              shortageTotalQty={sheet?.shortageTotalQty ?? null}
              shortageClearedAt={sheet?.shortageClearedAt ?? null}
              gobricksShortageSyncAt={sheet?.gobricksShortageSyncAt ?? null}
              gobricksGdsPriceCny={sheet?.gobricksGdsPriceCny ?? null}
              updatedAtIso={updatedAtIso}
              owned={true}
              favorite={favoriteForOwnedPreview.has(r.subjectId)}
              showInstructionBadge={Boolean(prof?.hasInstructionsPdf)}
              showSourceBadge={Boolean(prof?.hasIoSource)}
            />
          );
        })}
      </HomeListStrip>
    ) : (
      <p className="text-sm text-[var(--muted)]">{emptyTabHint("moc", "my")}</p>
    );

  const favoritePanel =
    favAll.length > 0 ? (
      <HomeListStrip
        heading="MOC"
        total={favAll.length}
        moreHref={mocListHref({ mark: "favorite" })}
        moreLabel="MOC 目录 · 已收藏（仅已存零件表）"
        previewCap={HOME_PREVIEW_MAX}
        hideCategoryTitle
      >
        {favPreview.map((r) => {
          const prof = mocProfileById.get(r.subjectId);
          const displayName = prof?.displayName?.trim() ?? "";
          const title = displayName || `MOC ${r.subjectId}`;
          const tags = prof?.tags ?? [];
          const stored = mocCoverStored.get(r.subjectId);
          const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, r.subjectId, stored) : null;
          const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_MOC, r.subjectId);
          const sheet = sheetByKindId.get(`${BUILD_SUBJECT_MOC}:${r.subjectId}`);
          const totalPartQty = sheet?.totalPartQty ?? 0;
          const favAt = mocMarkedAt.get(r.subjectId) ?? r.markedAt;
          const updatedAtIso = sheet?.updatedAt ?? favAt;
          return (
            <SavedSubjectListRow
              key={`moc-fav-${r.subjectId}`}
              className={PREVIEW_SUBJECT_LI}
              kind={BUILD_SUBJECT_MOC}
              subjectId={r.subjectId}
              detailHref={detailHref}
              title={title}
              coverUrl={uploadCoverUrl}
              tags={tags}
              mocTagHref={(tag) => mocListHref({ tag })}
              totalPartQty={totalPartQty}
              shortageLineCount={sheet?.shortageLineCount ?? null}
              shortageTotalQty={sheet?.shortageTotalQty ?? null}
              shortageClearedAt={sheet?.shortageClearedAt ?? null}
              gobricksShortageSyncAt={sheet?.gobricksShortageSyncAt ?? null}
              gobricksGdsPriceCny={sheet?.gobricksGdsPriceCny ?? null}
              updatedAtIso={updatedAtIso}
              owned={ownedForFavPreview.has(r.subjectId)}
              favorite={true}
              showInstructionBadge={Boolean(prof?.hasInstructionsPdf)}
              showSourceBadge={Boolean(prof?.hasIoSource)}
            />
          );
        })}
      </HomeListStrip>
    ) : (
      <p className="text-sm text-[var(--muted)]">{emptyTabHint("moc", "favorite")}</p>
    );

  return (
    <section className="section-panel" aria-labelledby="home-moc-block-heading">
      <header className="mb-4">
        <p className="page-kicker">本地标记</p>
        <h2 id="home-moc-block-heading" className="section-title text-[var(--text)]">
          MOC
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          每类 Tab 内最多展示 {HOME_PREVIEW_MAX} 条。MOC 目录的「已拥有 / 已收藏」筛选仅含
          <strong className="font-medium text-[var(--text)]">已保存零件表</strong> 的条目；此处列表为全部本地标记。
        </p>
        {ownedAll.length === 0 && favAll.length > 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">暂无已拥有的 MOC，已默认打开「收藏」Tab。</p>
        ) : null}
      </header>
      <HomeMyFavoriteTabs
        defaultTab={pickHomeDefaultTab(ownedAll.length, favAll.length)}
        myPanel={myPanel}
        favoritePanel={favoritePanel}
      />
    </section>
  );
}

/** 套装：我的 / 收藏 两个 Tab */
export async function HomeSetBlock() {
  const userDb = getUserDb();
  const catalogDb = getCatalogDb();

  const [ownedAll, favAll] = await Promise.all([
    userDb
      .select()
      .from(buildOwnedSubjects)
      .where(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_SET))
      .orderBy(desc(buildOwnedSubjects.markedAt)),
    userDb
      .select()
      .from(buildFavoriteSubjects)
      .where(eq(buildFavoriteSubjects.subjectKind, BUILD_SUBJECT_SET))
      .orderBy(desc(buildFavoriteSubjects.markedAt)),
  ]);

  const ownedPreview = ownedAll.slice(0, HOME_PREVIEW_MAX);
  const favPreview = favAll.slice(0, HOME_PREVIEW_MAX);
  const enrichNums = [...new Set([...ownedPreview.map((r) => r.subjectId), ...favPreview.map((r) => r.subjectId)])];

  const setNameByNum = new Map<string, string>();
  let setHeroByNum = new Map<string, string | null>();
  const setProfileByNum = new Map<string, { displayName: string; tags: string[] }>();
  const setCoverStored = new Map<string, string>();
  const sheetByKindId = new Map<string, SheetMeta>();
  let setOfficialPartQtyByNum = new Map<string, number>();
  const setMarkedAt = new Map<string, string>();
  for (const r of favAll) setMarkedAt.set(r.subjectId, r.markedAt);

  if (enrichNums.length > 0) {
    const [names, heroes, profRows, imgRows, sheetRows, officialQty] = await Promise.all([
      catalogDb
        .select({ setNum: legoSets.setNum, name: legoSets.name })
        .from(legoSets)
        .where(inArray(legoSets.setNum, enrichNums)),
      batchSetCatalogHeroUrls(enrichNums),
      userDb
        .select()
        .from(buildProfiles)
        .where(and(eq(buildProfiles.subjectKind, BUILD_SUBJECT_SET), inArray(buildProfiles.subjectId, enrichNums))),
      userDb
        .select({
          subjectId: buildImages.subjectId,
          storedFile: buildImages.storedFile,
          createdAt: buildImages.createdAt,
        })
        .from(buildImages)
        .where(and(eq(buildImages.subjectKind, BUILD_SUBJECT_SET), inArray(buildImages.subjectId, enrichNums)))
        .orderBy(asc(buildImages.createdAt)),
      userDb
        .select()
        .from(buildSavedPartsSheets)
        .where(and(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_SET), inArray(buildSavedPartsSheets.subjectId, enrichNums))),
      (async () => {
        const invRows = await catalogDb
          .select({ setNum: inventories.setNum, id: inventories.id })
          .from(inventories)
          .where(inArray(inventories.setNum, enrichNums))
          .orderBy(desc(inventories.version), desc(inventories.id));
        const latestInvIdBySet = new Map<string, number>();
        for (const row of invRows) {
          if (!latestInvIdBySet.has(row.setNum)) latestInvIdBySet.set(row.setNum, row.id);
        }
        const invIds = [...new Set(latestInvIdBySet.values())];
        if (invIds.length === 0) return new Map<string, number>();
        const sumRows = await catalogDb
          .select({
            inventoryId: inventoryParts.inventoryId,
            total: sql<number>`coalesce(sum(${inventoryParts.quantity}), 0)`,
          })
          .from(inventoryParts)
          .where(inArray(inventoryParts.inventoryId, invIds))
          .groupBy(inventoryParts.inventoryId);
        const totalByInvId = new Map<number, number>();
        for (const s of sumRows) totalByInvId.set(s.inventoryId, Number(s.total));
        const out = new Map<string, number>();
        for (const [setNum, invId] of latestInvIdBySet) {
          out.set(setNum, totalByInvId.get(invId) ?? 0);
        }
        return out;
      })(),
    ]);
    for (const c of names) {
      if (c.setNum) setNameByNum.set(c.setNum, (c.name ?? "").trim());
    }
    setHeroByNum = heroes;
    for (const p of profRows) {
      setProfileByNum.set(p.subjectId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
      });
    }
    for (const im of imgRows) {
      if (!setCoverStored.has(im.subjectId)) setCoverStored.set(im.subjectId, im.storedFile);
    }
    for (const row of sheetRows) {
      sheetByKindId.set(`${BUILD_SUBJECT_SET}:${row.subjectId}`, {
        totalPartQty: row.totalPartQty,
        updatedAt: row.updatedAt,
        shortageLineCount: row.shortageLineCount ?? null,
        shortageTotalQty: row.shortageTotalQty ?? null,
        shortageClearedAt: row.shortageClearedAt ?? null,
        gobricksShortageSyncAt: row.gobricksShortageSyncAt ?? null,
        gobricksGdsPriceCny:
          typeof row.gobricksGdsPriceCny === "number" && Number.isFinite(row.gobricksGdsPriceCny)
            ? row.gobricksGdsPriceCny
            : null,
      });
    }
    setOfficialPartQtyByNum = officialQty;
  }

  const ownedPreviewIds = ownedPreview.map((r) => r.subjectId);
  const favPreviewIds = favPreview.map((r) => r.subjectId);
  const favoriteForOwnedPreview = new Set<string>();
  const ownedForFavPreview = new Set<string>();
  if (ownedPreviewIds.length > 0) {
    const fr = await userDb
      .select()
      .from(buildFavoriteSubjects)
      .where(
        and(eq(buildFavoriteSubjects.subjectKind, BUILD_SUBJECT_SET), inArray(buildFavoriteSubjects.subjectId, ownedPreviewIds)),
      );
    for (const r of fr) favoriteForOwnedPreview.add(r.subjectId);
  }
  if (favPreviewIds.length > 0) {
    const orows = await userDb
      .select()
      .from(buildOwnedSubjects)
      .where(and(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_SET), inArray(buildOwnedSubjects.subjectId, favPreviewIds)));
    for (const r of orows) ownedForFavPreview.add(r.subjectId);
  }

  const myPanel =
    ownedAll.length > 0 ? (
      <HomeListStrip
        heading="套装"
        total={ownedAll.length}
        moreHref="/sets?theme=all&mark=owned"
        moreLabel="在套装列表中查看（已拥有）"
        previewCap={HOME_PREVIEW_MAX}
        hideCategoryTitle
      >
        {ownedPreview.map((r) => {
          const prof = setProfileByNum.get(r.subjectId);
          const displayName = prof?.displayName?.trim() ?? "";
          const catalogName = setNameByNum.get(r.subjectId) ?? "";
          const title = displayName || catalogName || `套装 ${r.subjectId}`;
          const tags = prof?.tags ?? [];
          const officialUrl = setHeroByNum.get(r.subjectId) ?? null;
          const stored = setCoverStored.get(r.subjectId);
          const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_SET, r.subjectId, stored) : null;
          const coverUrl = (officialUrl && officialUrl.length > 0 ? officialUrl : null) ?? uploadCoverUrl ?? null;
          const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, r.subjectId);
          const sheet = sheetByKindId.get(`${BUILD_SUBJECT_SET}:${r.subjectId}`);
          const totalPartQty = sheet?.totalPartQty ?? setOfficialPartQtyByNum.get(r.subjectId) ?? 0;
          const updatedAtIso = sheet?.updatedAt ?? r.markedAt;
          return (
            <SavedSubjectListRow
              key={`set-my-${r.subjectId}`}
              className={PREVIEW_SUBJECT_LI}
              kind={BUILD_SUBJECT_SET}
              subjectId={r.subjectId}
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
              owned={true}
              favorite={favoriteForOwnedPreview.has(r.subjectId)}
              showInstructionBadge={false}
              showSourceBadge={false}
            />
          );
        })}
      </HomeListStrip>
    ) : (
      <p className="text-sm text-[var(--muted)]">{emptyTabHint("set", "my")}</p>
    );

  const favoritePanel =
    favAll.length > 0 ? (
      <HomeListStrip
        heading="套装"
        total={favAll.length}
        moreHref="/sets?theme=all&mark=favorite"
        moreLabel="在套装列表中查看（已收藏）"
        previewCap={HOME_PREVIEW_MAX}
        hideCategoryTitle
      >
        {favPreview.map((r) => {
          const prof = setProfileByNum.get(r.subjectId);
          const displayName = prof?.displayName?.trim() ?? "";
          const catalogName = setNameByNum.get(r.subjectId) ?? "";
          const title = displayName || catalogName || `套装 ${r.subjectId}`;
          const tags = prof?.tags ?? [];
          const officialUrl = setHeroByNum.get(r.subjectId) ?? null;
          const stored = setCoverStored.get(r.subjectId);
          const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_SET, r.subjectId, stored) : null;
          const coverUrl = (officialUrl && officialUrl.length > 0 ? officialUrl : null) ?? uploadCoverUrl ?? null;
          const detailHref = buildSubjectDetailPath(BUILD_SUBJECT_SET, r.subjectId);
          const sheet = sheetByKindId.get(`${BUILD_SUBJECT_SET}:${r.subjectId}`);
          const totalPartQty = sheet?.totalPartQty ?? setOfficialPartQtyByNum.get(r.subjectId) ?? 0;
          const favAt = setMarkedAt.get(r.subjectId) ?? r.markedAt;
          const updatedAtIso = sheet?.updatedAt ?? favAt;
          return (
            <SavedSubjectListRow
              key={`set-fav-${r.subjectId}`}
              className={PREVIEW_SUBJECT_LI}
              kind={BUILD_SUBJECT_SET}
              subjectId={r.subjectId}
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
              owned={ownedForFavPreview.has(r.subjectId)}
              favorite={true}
              showInstructionBadge={false}
              showSourceBadge={false}
            />
          );
        })}
      </HomeListStrip>
    ) : (
      <p className="text-sm text-[var(--muted)]">{emptyTabHint("set", "favorite")}</p>
    );

  return (
    <section className="section-panel" aria-labelledby="home-set-block-heading">
      <header className="mb-4">
        <p className="page-kicker">本地标记</p>
        <h2 id="home-set-block-heading" className="section-title text-[var(--text)]">
          套装
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          每类 Tab 内最多展示 {HOME_PREVIEW_MAX} 条；完整列表请在套装官方目录使用「已拥有 / 已收藏」筛选。
        </p>
        {ownedAll.length === 0 && favAll.length > 0 ? (
          <p className="mt-1 text-xs text-[var(--muted)]">暂无已拥有的套装，已默认打开「收藏」Tab。</p>
        ) : null}
      </header>
      <HomeMyFavoriteTabs
        defaultTab={pickHomeDefaultTab(ownedAll.length, favAll.length)}
        myPanel={myPanel}
        favoritePanel={favoritePanel}
      />
    </section>
  );
}
