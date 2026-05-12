import "server-only";

import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  like,
  min,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  buildImages,
  buildProfiles,
  buildSavedPartsSheets,
  colors,
  elements,
  inventories,
  inventoryParts,
  legoSets,
  parts,
} from "@/db/schema";
import { colorDomId, elementDomId } from "@/lib/dom-anchors";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import type { GlobalSearchPayload } from "@/lib/global-search-types";
import { emptyGlobalSearchPayload } from "@/lib/global-search-types";

async function batchMinThumbByPartNum(
  db: ReturnType<typeof getDb>,
  partNums: string[]
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (partNums.length === 0) return out;
  const rows = await db
    .select({
      partNum: inventoryParts.partNum,
      thumb: min(inventoryParts.imgUrl),
    })
    .from(inventoryParts)
    .where(
      and(
        inArray(inventoryParts.partNum, partNums),
        isNotNull(inventoryParts.imgUrl),
        ne(inventoryParts.imgUrl, "")
      )
    )
    .groupBy(inventoryParts.partNum);
  for (const r of rows) {
    out.set(r.partNum, r.thumb);
  }
  return out;
}
import { likeFragment } from "@/lib/search";
import { batchSetCatalogHeroUrls } from "@/lib/set-catalog-hero-url";

export const GLOBAL_SEARCH_LIMITS_DROPDOWN = {
  moc: 5,
  set: 5,
  part: 5,
  color: 5,
  element: 5,
} as const;

/** 全站结果页：每类最多 5 条，更多请到各列表页用同一关键词筛选 */
export const GLOBAL_SEARCH_LIMITS_PAGE = {
  moc: 5,
  set: 5,
  part: 5,
  color: 5,
  element: 5,
} as const;

type Limits = {
  moc: number;
  set: number;
  part: number;
  color: number;
  element: number;
};

function resolveLimits(
  partial?: Partial<Limits>,
  preset: typeof GLOBAL_SEARCH_LIMITS_DROPDOWN | typeof GLOBAL_SEARCH_LIMITS_PAGE = GLOBAL_SEARCH_LIMITS_DROPDOWN
): Limits {
  return {
    moc: partial?.moc ?? preset.moc,
    set: partial?.set ?? preset.set,
    part: partial?.part ?? preset.part,
    color: partial?.color ?? preset.color,
    element: partial?.element ?? preset.element,
  };
}

export async function runGlobalSearch(options: {
  qRaw: string;
  limits?: Partial<Limits>;
  /** 全站结果页用更大默认上限 */
  variant?: "dropdown" | "page";
}): Promise<GlobalSearchPayload> {
  const q = likeFragment(options.qRaw ?? "");
  if (!q) return emptyGlobalSearchPayload();

  const preset =
    options.variant === "page" ? GLOBAL_SEARCH_LIMITS_PAGE : GLOBAL_SEARCH_LIMITS_DROPDOWN;
  const L = resolveLimits(options.limits, preset);
  const pattern = `%${q}%`;
  const db = getDb();

  const [mocRows, partRows, setRows, colorRows, elementRows] = await Promise.all([
    db
      .select({
        subjectId: buildSavedPartsSheets.subjectId,
        displayName: buildProfiles.displayName,
      })
      .from(buildSavedPartsSheets)
      .leftJoin(
        buildProfiles,
        and(
          eq(buildProfiles.subjectKind, BUILD_SUBJECT_MOC),
          eq(buildProfiles.subjectId, buildSavedPartsSheets.subjectId)
        )
      )
      .where(
        and(
          eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC),
          or(
            like(buildSavedPartsSheets.subjectId, pattern),
            like(buildProfiles.displayName, pattern),
            like(buildProfiles.tagsJson, pattern)
          )
        )
      )
      .orderBy(asc(buildSavedPartsSheets.subjectId))
      .limit(L.moc),
    db
      .select({
        partNum: parts.partNum,
        name: parts.name,
      })
      .from(parts)
      .where(or(like(parts.name, pattern), like(parts.partNum, pattern)))
      .orderBy(asc(parts.partNum))
      .limit(L.part),
    (async () => {
      const fromLego = await db
        .select({
          setNum: legoSets.setNum,
          name: legoSets.name,
          imgUrl: legoSets.imgUrl,
        })
        .from(legoSets)
        .where(or(like(legoSets.name, pattern), like(legoSets.setNum, pattern)))
        .orderBy(asc(legoSets.setNum))
        .limit(L.set);
      const seen = new Set(fromLego.map((r) => r.setNum));
      const need = L.set - fromLego.length;
      if (need <= 0) return fromLego;
      const invOnly = await db
        .select({ setNum: inventories.setNum })
        .from(inventories)
        .where(
          seen.size > 0
            ? and(like(inventories.setNum, pattern), notInArray(inventories.setNum, [...seen]))
            : like(inventories.setNum, pattern)
        )
        .groupBy(inventories.setNum)
        .orderBy(asc(inventories.setNum))
        .limit(need);
      const invSetNums = invOnly.map((r) => r.setNum);
      const heroBySet =
        invSetNums.length > 0 ? await batchSetCatalogHeroUrls(invSetNums) : new Map<string, string | null>();
      return [
        ...fromLego,
        ...invOnly.map((r) => ({
          setNum: r.setNum,
          name: "仅有官方清单（未在 sets.csv）",
          imgUrl: heroBySet.get(r.setNum) ?? null,
        })),
      ];
    })(),
    db
      .select({
        id: colors.id,
        name: colors.name,
        rgb: colors.rgb,
      })
      .from(colors)
      .where(
        or(like(colors.name, pattern), like(sql`cast(${colors.id} as text)`, pattern))
      )
      .orderBy(asc(colors.id))
      .limit(L.color),
    db
      .select({
        elementId: elements.elementId,
        partNum: elements.partNum,
        partName: parts.name,
        colorName: colors.name,
        designId: elements.designId,
      })
      .from(elements)
      .innerJoin(parts, eq(elements.partNum, parts.partNum))
      .innerJoin(colors, eq(elements.colorId, colors.id))
      .where(
        or(
          like(elements.elementId, pattern),
          like(elements.partNum, pattern),
          and(isNotNull(elements.designId), like(elements.designId, pattern))
        )
      )
      .orderBy(asc(elements.elementId))
      .limit(L.element),
  ]);

  const mocSubjectIds = mocRows.map((r) => r.subjectId);
  const mocCoverById = new Map<string, string | null>();
  if (mocSubjectIds.length > 0) {
    const imgRows = await db
      .select({
        subjectId: buildImages.subjectId,
        storedFile: buildImages.storedFile,
        createdAt: buildImages.createdAt,
      })
      .from(buildImages)
      .where(
        and(eq(buildImages.subjectKind, BUILD_SUBJECT_MOC), inArray(buildImages.subjectId, mocSubjectIds))
      )
      .orderBy(asc(buildImages.createdAt));
    for (const im of imgRows) {
      if (mocCoverById.has(im.subjectId)) continue;
      mocCoverById.set(
        im.subjectId,
        buildImagePublicPath(BUILD_SUBJECT_MOC, im.subjectId, im.storedFile)
      );
    }
  }

  const base: GlobalSearchPayload = {
    mocs: mocRows.map((r) => {
      const dn = (r.displayName ?? "").trim();
      return {
        type: "moc" as const,
        title: dn || r.subjectId,
        subtitle: dn ? r.subjectId : "本地 MOC",
        href: buildSubjectDetailPath(BUILD_SUBJECT_MOC, r.subjectId),
        imgUrl: mocCoverById.get(r.subjectId) ?? null,
      };
    }),
    sets: setRows.map((r) => ({
      type: "set" as const,
      title: r.setNum,
      subtitle: r.name,
      href: `/sets/${encodeURIComponent(r.setNum)}`,
      imgUrl: r.imgUrl,
    })),
    parts: partRows.map((r) => ({
      type: "part" as const,
      title: r.partNum,
      subtitle: r.name,
      href: `/parts/${encodeURIComponent(r.partNum)}`,
    })),
    colors: colorRows.map((r) => ({
      type: "color" as const,
      title: r.name,
      subtitle: `id ${r.id} · #${r.rgb}`,
      href: `/colors#${colorDomId(r.id)}`,
      rgb: r.rgb,
    })),
    elements: elementRows.map((r) => ({
      type: "element" as const,
      title: r.elementId,
      subtitle: `${r.partNum} · ${r.colorName}`,
      href: `/parts/${encodeURIComponent(r.partNum)}#${elementDomId(r.elementId)}`,
      partNum: r.partNum,
    })),
  };

  if (options.variant !== "page") {
    return base;
  }

  const thumbKeys = new Set<string>();
  for (const p of base.parts) thumbKeys.add(p.title);
  for (const e of base.elements) thumbKeys.add(e.partNum);
  const thumbByPart = await batchMinThumbByPartNum(db, [...thumbKeys]);

  return {
    ...base,
    parts: base.parts.map((p) => ({
      ...p,
      imgUrl: thumbByPart.get(p.title) ?? null,
    })),
    elements: base.elements.map((e) => ({
      ...e,
      imgUrl: thumbByPart.get(e.partNum) ?? null,
    })),
  };
}
