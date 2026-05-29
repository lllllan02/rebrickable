import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import {
  HomeWorkflowPreviewBlock,
  type HomeWorkflowPreviewItem,
} from "@/components/home-workflow-preview-block";
import { getCatalogDb, getUserDb } from "@/db/client";
import {
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
import { countWorkflowStagesByMark } from "@/lib/count-workflow-stages-by-mark";
import { workflowStageFromRow } from "@/lib/build-workflow-from-row";
import { mocSubjectIdsWithUserData } from "@/lib/moc-subject-still-exists";
import { parseTagsJson } from "@/lib/moc-profile-parse";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";

export const dynamic = "force-dynamic";

const HOME_PREVIEW_MAX = 4;

type SheetMeta = {
  totalPartQty: number;
  updatedAt: string;
  shortageLineCount: number | null;
  shortageTotalQty: number | null;
  shortageClearedAt: string | null;
  gobricksShortageSyncAt: string | null;
  gobricksGdsPriceCny: number | null;
};

function emptyWorkflowHint(kind: "moc" | "set"): string {
  return kind === "moc"
    ? "暂无进度中的 MOC。在详情页进度条上点击「收录」或后续阶段即可加入。"
    : "暂无进度中的套装。在详情页或官方目录卡片上设置进度即可。";
}

/** MOC：拼搭进度预览 */
export async function HomeMocBlock() {
  const userDb = getUserDb();

  const workflowRows = await userDb
    .select()
    .from(buildOwnedSubjects)
    .where(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_MOC))
    .orderBy(desc(buildOwnedSubjects.markedAt));

  const existingMocIds = await mocSubjectIdsWithUserData(
    userDb,
    workflowRows.map((r) => r.subjectId)
  );
  const workflowAll = workflowRows.filter((r) => existingMocIds.has(r.subjectId));

  const stageCounts = countWorkflowStagesByMark(workflowAll, BUILD_SUBJECT_MOC);
  const enrichIds = workflowAll.map((r) => r.subjectId);

  const mocProfileById = new Map<
    string,
    { displayName: string; tags: string[]; hasInstructionsPdf: boolean; hasIoSource: boolean }
  >();
  const mocCoverStored = new Map<string, string>();
  const sheetByKindId = new Map<string, SheetMeta>();

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

  const previewItems: HomeWorkflowPreviewItem[] = workflowAll.map((r) => {
    const workflowStage = workflowStageFromRow(r);
    const prof = mocProfileById.get(r.subjectId);
    const displayName = prof?.displayName?.trim() ?? "";
    const title = displayName || `MOC ${r.subjectId}`;
    const stored = mocCoverStored.get(r.subjectId);
    const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_MOC, r.subjectId, stored) : null;
    const sheet = sheetByKindId.get(`${BUILD_SUBJECT_MOC}:${r.subjectId}`);
    return {
      subjectId: r.subjectId,
      workflowStage,
      detailHref: buildSubjectDetailPath(BUILD_SUBJECT_MOC, r.subjectId),
      title,
      coverUrl: uploadCoverUrl,
      tags: prof?.tags ?? [],
      totalPartQty: sheet?.totalPartQty ?? 0,
      updatedAtIso: sheet?.updatedAt ?? r.markedAt,
      showInstructionBadge: Boolean(prof?.hasInstructionsPdf),
      showSourceBadge: Boolean(prof?.hasIoSource),
      shortageLineCount: sheet?.shortageLineCount ?? null,
      shortageTotalQty: sheet?.shortageTotalQty ?? null,
      shortageClearedAt: sheet?.shortageClearedAt ?? null,
      gobricksShortageSyncAt: sheet?.gobricksShortageSyncAt ?? null,
      gobricksGdsPriceCny: sheet?.gobricksGdsPriceCny ?? null,
    };
  });

  return (
    <section className="section-panel" aria-labelledby="home-moc-block-heading">
      <header className="mb-3">
        <p className="page-kicker">本地标记</p>
        <h2 id="home-moc-block-heading" className="section-title text-[var(--text)]">
          MOC
          <span className="ml-2 font-normal text-sm text-[var(--muted)] tabular-nums">
            （{(stageCounts.all ?? 0).toLocaleString("zh-CN")}）
          </span>
        </h2>
      </header>
      <HomeWorkflowPreviewBlock
        subjectKind={BUILD_SUBJECT_MOC}
        counts={stageCounts}
        items={previewItems}
        previewCap={HOME_PREVIEW_MAX}
        moreLabel="MOC 目录（已存零件表）"
      />
      {workflowAll.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{emptyWorkflowHint("moc")}</p>
      ) : null}
    </section>
  );
}

/** 套装：拼搭进度预览 */
export async function HomeSetBlock() {
  const userDb = getUserDb();
  const catalogDb = getCatalogDb();

  const workflowAll = await userDb
    .select()
    .from(buildOwnedSubjects)
    .where(eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_SET))
    .orderBy(desc(buildOwnedSubjects.markedAt));

  const stageCounts = countWorkflowStagesByMark(workflowAll, BUILD_SUBJECT_SET);
  const enrichNums = workflowAll.map((r) => r.subjectId);

  const setNameByNum = new Map<string, string>();
  let setHeroByNum = new Map<string, string | null>();
  const setProfileByNum = new Map<string, { displayName: string; tags: string[] }>();
  const setCoverStored = new Map<string, string>();
  const sheetByKindId = new Map<string, SheetMeta>();
  let setOfficialPartQtyByNum = new Map<string, number>();

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

  const previewItems: HomeWorkflowPreviewItem[] = workflowAll.map((r) => {
    const workflowStage = workflowStageFromRow(r, BUILD_SUBJECT_SET);
    const prof = setProfileByNum.get(r.subjectId);
    const displayName = prof?.displayName?.trim() ?? "";
    const catalogName = setNameByNum.get(r.subjectId) ?? "";
    const title = displayName || catalogName || `套装 ${r.subjectId}`;
    const officialUrl = setHeroByNum.get(r.subjectId) ?? null;
    const stored = setCoverStored.get(r.subjectId);
    const uploadCoverUrl = stored ? buildImagePublicPath(BUILD_SUBJECT_SET, r.subjectId, stored) : null;
    const coverUrl = (officialUrl && officialUrl.length > 0 ? officialUrl : null) ?? uploadCoverUrl ?? null;
    const sheet = sheetByKindId.get(`${BUILD_SUBJECT_SET}:${r.subjectId}`);
    return {
      subjectId: r.subjectId,
      workflowStage,
      detailHref: buildSubjectDetailPath(BUILD_SUBJECT_SET, r.subjectId),
      title,
      coverUrl,
      tags: prof?.tags ?? [],
      totalPartQty: sheet?.totalPartQty ?? setOfficialPartQtyByNum.get(r.subjectId) ?? 0,
      updatedAtIso: sheet?.updatedAt ?? r.markedAt,
      showInstructionBadge: false,
      showSourceBadge: false,
      shortageLineCount: sheet?.shortageLineCount ?? null,
      shortageTotalQty: sheet?.shortageTotalQty ?? null,
      shortageClearedAt: sheet?.shortageClearedAt ?? null,
      gobricksShortageSyncAt: sheet?.gobricksShortageSyncAt ?? null,
      gobricksGdsPriceCny: sheet?.gobricksGdsPriceCny ?? null,
    };
  });

  return (
    <section className="section-panel" aria-labelledby="home-set-block-heading">
      <header className="mb-3">
        <p className="page-kicker">本地标记</p>
        <h2 id="home-set-block-heading" className="section-title text-[var(--text)]">
          套装
          <span className="ml-2 font-normal text-sm text-[var(--muted)] tabular-nums">
            （{(stageCounts.all ?? 0).toLocaleString("zh-CN")}）
          </span>
        </h2>
      </header>
      <HomeWorkflowPreviewBlock
        subjectKind={BUILD_SUBJECT_SET}
        counts={stageCounts}
        items={previewItems}
        previewCap={HOME_PREVIEW_MAX}
        moreLabel="套装官方目录"
      />
      {workflowAll.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{emptyWorkflowHint("set")}</p>
      ) : null}
    </section>
  );
}
