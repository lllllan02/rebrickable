import Link from "next/link";
import {
  and,
  asc,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  like,
  max,
  min,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { BuildOwnedToggle } from "@/app/build/build-owned-toggle";
import { getDb } from "@/db/client";
import {
  inventories,
  inventoryMinifigs,
  inventoryParts,
  buildOwnedSubjects,
  legoSets,
  legoThemes,
  minifigs,
} from "@/db/schema";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { likeFragment } from "@/lib/search";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";

/** 与 MOC 列表相同栅格，略减小每页条数以控制首屏高度 */
const PAGE_SIZE = 24;

function pageNavSequence(
  current: number,
  total: number,
  neighbors = 3
): (number | "gap")[] {
  if (total <= 1) return [1];
  const set = new Set<number>();
  set.add(1);
  set.add(total);
  for (let p = current - neighbors; p <= current + neighbors; p++) {
    if (p >= 1 && p <= total) set.add(p);
  }
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]!;
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("gap");
    out.push(p);
  }
  return out;
}

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export type SetsCatalogSearchParams = { q?: string; page?: string; theme?: string };

function invLatestSubquery(db: ReturnType<typeof getDb>) {
  return db
    .select({
      setNum: inventories.setNum,
      maxVersion: max(inventories.version).as("max_version"),
    })
    .from(inventories)
    .groupBy(inventories.setNum)
    .as("inv_latest");
}

function buildChildrenMap(rows: { id: number; parentId: number | null }[]) {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.parentId != null) {
      const arr = children.get(r.parentId) ?? [];
      arr.push(r.id);
      children.set(r.parentId, arr);
    }
  }
  for (const arr of children.values()) arr.sort((a, b) => a - b);
  return children;
}

/** 含自身；若 root 不在 themes 表中则仅 [rootId]（SQL 仍可按该 id 筛选） */
function collectDescendantThemeIds(
  rootId: number,
  themeIdSet: Set<number>,
  children: Map<number, number[]>
): number[] {
  if (!themeIdSet.has(rootId)) return [rootId];
  const out: number[] = [];
  const stack = [rootId];
  const seen = new Set<number>();
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  return out;
}

type ThemePickerRow = { id: number; name: string; parentId: number | null };

/** 根主题栅格；不在卡片内嵌子主题树，避免子网格溢出叠到下一行。子主题随 ?theme= 筛选已由 collectDescendantThemeIds 覆盖。 */
function SetsThemePickerGrid({
  roots,
  rollup,
  actionBase,
  heroByThemeId,
}: {
  roots: ThemePickerRow[];
  rollup: Map<number, number>;
  actionBase: string;
  heroByThemeId: Map<number, string | null>;
}) {
  if (roots.length === 0) return null;

  return (
    <ul
      className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
      role="list"
    >
      {roots.map((t) => {
        const n = rollup.get(t.id) ?? 0;
        const href = `${actionBase}?theme=${encodeURIComponent(String(t.id))}`;
        const hero = heroByThemeId.get(t.id) ?? null;

        return (
          <li key={t.id} className="result-card flex min-w-0 flex-col gap-0 overflow-hidden p-0">
            <Link
              href={href}
              className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]"
              aria-label={`${t.name} 封面`}
            >
              {usableImgUrl(hero) ? (
                <RemoteCoverImage
                  src={hero.trim()}
                  fill
                  className="object-contain p-2 sm:p-3"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 20vw, 16vw"
                  alt=""
                  fallbackLabel="无图"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-sm text-[var(--muted)]">
                  无预览图
                </span>
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
              <div className="min-w-0">
                <Link
                  href={href}
                  className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                >
                  {t.name}
                </Link>
                <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                  {n.toLocaleString("zh-CN")} 套
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function computeRollupCounts(
  themeRows: { id: number; parentId: number | null }[],
  directCount: Map<number, number>,
  children: Map<number, number[]>
): Map<number, number> {
  const rollup = new Map<number, number>();
  const dfs = (id: number): number => {
    const hit = rollup.get(id);
    if (hit !== undefined) return hit;
    let sum = directCount.get(id) ?? 0;
    for (const c of children.get(id) ?? []) sum += dfs(c);
    rollup.set(id, sum);
    return sum;
  };
  for (const t of themeRows) dfs(t.id);
  return rollup;
}

/** 与「按主题浏览」栅格相同的根主题列表，供套装列表筛选栏下拉使用 */
async function loadThemeSelectRootRows(
  db: ReturnType<typeof getDb>
): Promise<{ id: number; name: string }[]> {
  const invLatest = invLatestSubquery(db);
  const [themeRows, directRows] = await Promise.all([
    db.select({ id: legoThemes.id, name: legoThemes.name, parentId: legoThemes.parentId }).from(legoThemes),
    db
      .select({
        themeId: legoSets.themeId,
        c: countDistinct(inventories.setNum),
      })
      .from(inventories)
      .innerJoin(
        invLatest,
        and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
      )
      .leftJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
      .where(isNotNull(legoSets.themeId))
      .groupBy(legoSets.themeId),
  ]);
  const children = buildChildrenMap(themeRows);
  const directCount = new Map<number, number>();
  for (const r of directRows) {
    if (r.themeId != null) directCount.set(r.themeId, Number(r.c ?? 0));
  }
  const rollup = computeRollupCounts(themeRows, directCount, children);
  const roots = themeRows
    .filter((t) => t.parentId == null && (rollup.get(t.id) ?? 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  const flatFallback =
    roots.length === 0
      ? themeRows
          .filter((t) => (rollup.get(t.id) ?? 0) > 0)
          .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
      : null;
  return (flatFallback ?? roots).map((t) => ({ id: t.id, name: t.name }));
}

export async function SetsOfficialCatalogSection({
  searchParams,
  actionBase,
}: {
  searchParams: SetsCatalogSearchParams;
  actionBase: string;
}) {
  const qRaw = searchParams.q ?? "";
  const q = likeFragment(qRaw);
  const themeRaw = (searchParams.theme ?? "").trim();
  const requestedPage = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const db = getDb();

  const showThemePicker = themeRaw.length === 0 && q.length === 0;

  if (showThemePicker) {
    const invLatest = invLatestSubquery(db);
    const [themeRows, directRows, totalRow] = await Promise.all([
      db.select({ id: legoThemes.id, name: legoThemes.name, parentId: legoThemes.parentId }).from(legoThemes),
      db
        .select({
          themeId: legoSets.themeId,
          c: countDistinct(inventories.setNum),
        })
        .from(inventories)
        .innerJoin(
          invLatest,
          and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
        )
        .leftJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
        .where(isNotNull(legoSets.themeId))
        .groupBy(legoSets.themeId),
      db
        .select({ c: countDistinct(inventories.setNum) })
        .from(inventories)
        .innerJoin(
          invLatest,
          and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
        ),
    ]);

    const children = buildChildrenMap(themeRows);
    const directCount = new Map<number, number>();
    for (const r of directRows) {
      if (r.themeId != null) directCount.set(r.themeId, Number(r.c ?? 0));
    }
    const rollup = computeRollupCounts(themeRows, directCount, children);
    const totalAll = Number(totalRow[0]?.c ?? 0);

    const roots = themeRows
      .filter((t) => t.parentId == null && (rollup.get(t.id) ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

    const flatFallback =
      roots.length === 0
        ? themeRows
            .filter((t) => (rollup.get(t.id) ?? 0) > 0)
            .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
        : null;

    const rootsForTree = flatFallback ?? roots;

    const themeIdsListed = themeRows
      .filter((t) => (rollup.get(t.id) ?? 0) > 0)
      .map((t) => t.id);

    const heroCand =
      themeIdsListed.length > 0
        ? await db
            .select({
              themeId: legoSets.themeId,
              imgUrl: legoSets.imgUrl,
              numParts: legoSets.numParts,
              setNum: legoSets.setNum,
            })
            .from(inventories)
            .innerJoin(
              invLatest,
              and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
            )
            .innerJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
            .where(
              and(
                isNotNull(legoSets.themeId),
                inArray(legoSets.themeId, themeIdsListed),
                isNotNull(legoSets.imgUrl),
                ne(legoSets.imgUrl, "")
              )
            )
        : [];

    const directBest = new Map<number, { parts: number; setNum: string; url: string }>();
    for (const row of heroCand) {
      if (row.themeId == null || !row.imgUrl?.trim()) continue;
      const tid = row.themeId;
      const parts = Number(row.numParts ?? 0);
      const cur = directBest.get(tid);
      if (!cur || parts > cur.parts || (parts === cur.parts && row.setNum < cur.setNum)) {
        directBest.set(tid, { parts, setNum: row.setNum, url: row.imgUrl.trim() });
      }
    }

    const heroByThemeId = new Map<number, string | null>();
    function resolveHero(id: number): string | null {
      if (heroByThemeId.has(id)) return heroByThemeId.get(id)!;
      const own = directBest.get(id)?.url ?? null;
      if (own) {
        heroByThemeId.set(id, own);
        return own;
      }
      for (const cid of [...(children.get(id) ?? [])].sort((a, b) => a - b)) {
        const h = resolveHero(cid);
        if (h) {
          heroByThemeId.set(id, h);
          return h;
        }
      }
      heroByThemeId.set(id, null);
      return null;
    }
    for (const tid of themeIdsListed) resolveHero(tid);

    return (
      <section className="space-y-4" aria-labelledby="sets-official-catalog-heading">
        <h2 id="sets-official-catalog-heading" className="page-title text-xl sm:text-2xl">
          套装目录
        </h2>
        <p className="text-sm text-[var(--muted)]">
          请先选择主题以浏览该系列下的套装；也可使用全库入口按编号或名称搜索任意套装。卡片配图来自该主题（含子系列）下清单中盒图较完整的一套套装示意，并非官方「主题横幅」。
        </p>
        <div className="table-shell p-4 sm:p-5">
          <div className="mb-6 flex flex-wrap gap-3">
            <Link
              href={`${actionBase}?theme=all`}
              className="result-card inline-flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
            >
              <span className="text-sm font-semibold text-[var(--text)]">全库浏览</span>
              <span className="text-xs text-[var(--muted)]">
                不按主题筛选，支持关键词搜索（共 {totalAll.toLocaleString("zh-CN")} 套有清单）
              </span>
            </Link>
          </div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">按主题浏览</h3>
          <SetsThemePickerGrid
            roots={rootsForTree}
            rollup={rollup}
            actionBase={actionBase}
            heroByThemeId={heroByThemeId}
          />
        </div>
      </section>
    );
  }

  const useFullCatalog = themeRaw === "all" || (themeRaw.length === 0 && q.length > 0);
  const parsedThemeId = Number.parseInt(themeRaw, 10);
  const themeNumericOk = Number.isFinite(parsedThemeId) && String(parsedThemeId) === themeRaw;
  let themeFilterIds: number[] | null = null;
  let invalidThemeParam = false;

  let filteredThemeLabel: string | null = null;

  if (!useFullCatalog) {
    if (!themeNumericOk) {
      invalidThemeParam = themeRaw.length > 0;
      themeFilterIds = [];
    } else {
      const themeMeta = await db
        .select({ id: legoThemes.id, name: legoThemes.name, parentId: legoThemes.parentId })
        .from(legoThemes);
      const themeIdSet = new Set(themeMeta.map((t) => t.id));
      const children = buildChildrenMap(themeMeta);
      themeFilterIds = collectDescendantThemeIds(parsedThemeId, themeIdSet, children);
      filteredThemeLabel =
        themeMeta.find((t) => t.id === parsedThemeId)?.name?.trim() || `主题 ${parsedThemeId}`;
    }
  }

  const pattern = `%${q}%`;
  const searchWhere: SQL | undefined =
    q.length > 0
      ? or(like(inventories.setNum, pattern), like(legoSets.name, pattern))
      : undefined;

  const themeWhere: SQL | undefined =
    themeFilterIds == null
      ? undefined
      : themeFilterIds.length === 0
        ? sql`0=1`
        : inArray(legoSets.themeId, themeFilterIds);

  const invWhere =
    searchWhere && themeWhere
      ? and(searchWhere, themeWhere)
      : searchWhere ?? themeWhere;

  const invLatest = invLatestSubquery(db);

  const totalRow = await db
    .select({ c: countDistinct(inventories.setNum) })
    .from(inventories)
    .innerJoin(
      invLatest,
      and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
    )
    .leftJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
    .where(invWhere);

  const total = Number(totalRow[0]?.c ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(totalPages, requestedPage);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      setNum: inventories.setNum,
      inventoryId: inventories.id,
      version: inventories.version,
      setBoxImg: legoSets.imgUrl,
      setName: legoSets.name,
      themeName: legoThemes.name,
    })
    .from(inventories)
    .innerJoin(
      invLatest,
      and(eq(inventories.setNum, invLatest.setNum), eq(inventories.version, invLatest.maxVersion))
    )
    .leftJoin(legoSets, eq(inventories.setNum, legoSets.setNum))
    .leftJoin(legoThemes, eq(legoSets.themeId, legoThemes.id))
    .where(invWhere)
    .orderBy(asc(inventories.setNum))
    .limit(PAGE_SIZE)
    .offset(offset);

  const invIds = rows.map((r) => r.inventoryId);
  const pageSetNums = [...new Set(rows.map((r) => r.setNum))];
  const minifigThumbBySetNum = new Map<string, string>();
  if (pageSetNums.length > 0) {
    const figRows = await db
      .select({ figNum: minifigs.figNum, imgUrl: minifigs.imgUrl })
      .from(minifigs)
      .where(
        and(
          inArray(minifigs.figNum, pageSetNums),
          isNotNull(minifigs.imgUrl),
          ne(minifigs.imgUrl, "")
        )
      );
    for (const fr of figRows) {
      if (fr.imgUrl && fr.figNum) minifigThumbBySetNum.set(fr.figNum, fr.imgUrl.trim());
    }
  }

  const ownedPageSetNums = new Set<string>();
  if (pageSetNums.length > 0) {
    const ownedRows = await db
      .select({ subjectId: buildOwnedSubjects.subjectId })
      .from(buildOwnedSubjects)
      .where(
        and(
          eq(buildOwnedSubjects.subjectKind, BUILD_SUBJECT_SET),
          inArray(buildOwnedSubjects.subjectId, pageSetNums)
        )
      );
    for (const r of ownedRows) ownedPageSetNums.add(r.subjectId);
  }

  const invIdsNeedInvMinifigThumb = rows
    .filter(
      (r) => !usableImgUrl(r.setBoxImg) && !usableImgUrl(minifigThumbBySetNum.get(r.setNum))
    )
    .map((r) => r.inventoryId);
  const thumbByInv = new Map<number, string>();
  const mainQtyByInv = new Map<number, number>();
  const spareQtyByInv = new Map<number, number>();

  if (invIds.length > 0) {
    const statRows = await db
      .select({
        inventoryId: inventoryParts.inventoryId,
        mainQty: sql<number>`coalesce(sum(case when ${inventoryParts.isSpare} = 0 then ${inventoryParts.quantity} else 0 end), 0)`,
        spareQty: sql<number>`coalesce(sum(case when ${inventoryParts.isSpare} = 1 then ${inventoryParts.quantity} else 0 end), 0)`,
      })
      .from(inventoryParts)
      .where(inArray(inventoryParts.inventoryId, invIds))
      .groupBy(inventoryParts.inventoryId);

    if (invIdsNeedInvMinifigThumb.length > 0) {
      const miniRows = await db
        .select({
          inventoryId: inventoryMinifigs.inventoryId,
          thumb: min(minifigs.imgUrl),
        })
        .from(inventoryMinifigs)
        .innerJoin(minifigs, eq(inventoryMinifigs.figNum, minifigs.figNum))
        .where(
          and(
            inArray(inventoryMinifigs.inventoryId, invIdsNeedInvMinifigThumb),
            isNotNull(minifigs.imgUrl),
            ne(minifigs.imgUrl, "")
          )
        )
        .groupBy(inventoryMinifigs.inventoryId);
      for (const t of miniRows) {
        if (t.thumb) thumbByInv.set(t.inventoryId, t.thumb);
      }
    }
    for (const s of statRows) {
      mainQtyByInv.set(s.inventoryId, Number(s.mainQty));
      spareQtyByInv.set(s.inventoryId, Number(s.spareQty));
    }
  }

  const themeSelectRoots = await loadThemeSelectRootRows(db);
  const themeOptionsForSelect =
    !useFullCatalog &&
    themeNumericOk &&
    themeRaw !== "all" &&
    filteredThemeLabel != null &&
    !themeSelectRoots.some((t) => t.id === parsedThemeId)
      ? [{ id: parsedThemeId, name: filteredThemeLabel }, ...themeSelectRoots]
      : themeSelectRoots;

  const themeSelectDefault =
    themeNumericOk && themeRaw.length > 0 && themeRaw !== "all" ? themeRaw : "all";

  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (qRaw.trim()) u.set("q", qRaw.trim());
    if (themeRaw === "all") u.set("theme", "all");
    else if (themeNumericOk && themeRaw.length > 0) u.set("theme", themeRaw);
    if (p > 1) u.set("page", String(p));
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  const detailPath = (setNum: string) => `/sets/${encodeURIComponent(setNum)}`;

  const catalogSubtitle =
    themeRaw === "all"
      ? "全库"
      : filteredThemeLabel != null
        ? filteredThemeLabel
        : null;

  return (
    <section className="space-y-4" aria-labelledby="sets-official-catalog-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="sets-official-catalog-heading" className="page-title text-xl sm:text-2xl">
          套装目录
          {catalogSubtitle != null ? (
            <span className="mt-1 block text-base font-normal text-[var(--muted)]">{catalogSubtitle}</span>
          ) : null}
        </h2>
        <Link href={actionBase} className="shrink-0 text-sm text-[var(--accent)] underline-offset-2 hover:underline">
          ← 选择主题
        </Link>
      </div>
      {invalidThemeParam ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
          主题参数无效，请从{" "}
          <Link href={actionBase} className="text-[var(--accent)] underline-offset-2 hover:underline">
            主题列表
          </Link>{" "}
          重新选择。
        </p>
      ) : null}
      <form method="get" action={actionBase} className="filter-bar">
        <label className="sr-only" htmlFor="sets-catalog-theme">
          主题
        </label>
        <AutoSubmitSelect
          id="sets-catalog-theme"
          name="theme"
          defaultValue={themeSelectDefault}
          className="field max-w-full text-sm sm:max-w-[240px]"
        >
          <option value="all">全库浏览</option>
          {themeOptionsForSelect.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.name}
            </option>
          ))}
        </AutoSubmitSelect>
        <input
          name="q"
          defaultValue={qRaw}
          placeholder="set_num 或套装名关键词…"
          className="field min-w-[200px] flex-1 text-sm"
        />
        <button type="submit" className="button-primary text-sm">
          搜索
        </button>
      </form>
      <div className="table-shell">
        <ul className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((r) => {
            const thumb =
              usableImgUrl(r.setBoxImg)
                ? r.setBoxImg.trim()
                : minifigThumbBySetNum.get(r.setNum) ?? thumbByInv.get(r.inventoryId);
            const mainQty = mainQtyByInv.get(r.inventoryId) ?? 0;
            const spareQty = spareQtyByInv.get(r.inventoryId) ?? 0;
            const themeLabel = (r.themeName ?? "").trim();
            const title = (r.setName ?? "").trim() || `套装 ${r.setNum}`;
            const href = detailPath(r.setNum);
            return (
              <li key={r.setNum} className="result-card flex flex-col gap-0 overflow-hidden p-0">
                <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]">
                  <Link
                    href={href}
                    className="absolute inset-0 z-0 block"
                    aria-label={`${title} 封面`}
                  >
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
                        subjectKind={BUILD_SUBJECT_SET}
                        subjectId={r.setNum}
                        initialOwned={ownedPageSetNums.has(r.setNum)}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
                  <div className="min-w-0">
                    <Link
                      href={href}
                      className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                    >
                      {title}
                    </Link>
                    <p
                      className="mt-1 truncate font-mono text-xs text-[var(--muted)]"
                      title={`${r.setNum} · 清单 v${r.version}`}
                    >
                      {r.setNum} · v{r.version}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--muted)]">
                    <span className="min-w-0 flex-1 text-left leading-snug text-[var(--text)]">
                      <span className="text-[var(--muted-2)]">主题 </span>
                      <span className="line-clamp-2 break-words" title={themeLabel || undefined}>
                        {themeLabel || "—"}
                      </span>
                    </span>
                    <span className="max-w-[55%] shrink-0 text-right leading-snug tabular-nums">
                      {mainQty > 0 || spareQty > 0 ? (
                        <>
                          {mainQty > 0 ? (
                            <>
                              <span className="text-[var(--muted-2)]">主件 </span>
                              {mainQty.toLocaleString("zh-CN")} 粒
                            </>
                          ) : null}
                          {mainQty > 0 && spareQty > 0 ? <span className="text-[var(--muted)]"> · </span> : null}
                          {spareQty > 0 ? (
                            <>
                              <span className="text-[var(--muted-2)]">备用 </span>
                              {spareQty.toLocaleString("zh-CN")} 粒
                            </>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[var(--muted-2)]">—</span>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
          {rows.length === 0 ? (
            <li className="empty-state col-span-full text-sm">没有匹配的套装。</li>
          ) : null}
        </ul>
      </div>
      {totalPages > 1 ? (
        <div className="flex justify-end">
          <nav aria-label="官方清单分页" className="pagination-shell">
            {page > 1 ? (
              <Link href={`${actionBase}${qs(page - 1)}`} className="pager-link shrink-0">
                上一页
              </Link>
            ) : (
              <span className="pager-disabled shrink-0">上一页</span>
            )}
            <div className="flex flex-wrap items-center gap-0.5">
              {(() => {
                const seq = pageNavSequence(page, totalPages, 4);
                const mid = Math.floor(seq.length / 2);
                const renderChunk = (chunk: (number | "gap")[], keyBase: number) =>
                  chunk.map((item, i) => {
                    const k = keyBase + i;
                    return item === "gap" ? (
                      <span key={`g-${k}`} className="px-0.5 text-[var(--muted)]" aria-hidden>
                        …
                      </span>
                    ) : item === page ? (
                      <span
                        key={`p-${item}-${k}`}
                        className="pager-current inline-flex min-w-[1.75rem] justify-center"
                        aria-current="page"
                      >
                        {item}
                      </span>
                    ) : (
                      <Link
                        key={`p-${item}-${k}`}
                        href={`${actionBase}${qs(item)}`}
                        className="pager-link inline-flex min-w-[1.75rem] justify-center"
                      >
                        {item}
                      </Link>
                    );
                  });
                return (
                  <>
                    {renderChunk(seq.slice(0, mid), 0)}
                    <form
                      method="get"
                      action={actionBase}
                      className="mx-0.5 inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-full border border-[var(--border)] bg-[var(--bg)] outline-none ring-[var(--accent)] focus-within:ring-2"
                      title="输入页码后按回车跳转"
                    >
                      {qRaw.trim() ? <input type="hidden" name="q" value={qRaw.trim()} /> : null}
                      {themeSelectDefault === "all" ? (
                        <input type="hidden" name="theme" value="all" />
                      ) : (
                        <input type="hidden" name="theme" value={themeSelectDefault} />
                      )}
                      <input
                        type="number"
                        name="page"
                        min={1}
                        max={totalPages}
                        defaultValue={page}
                        required
                        aria-label={`跳转到页码，范围 1–${totalPages}，回车确认`}
                        className="h-full min-w-[1.75rem] max-w-[3.25rem] border-0 bg-transparent px-0.5 text-center font-mono text-xs text-[var(--text)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button type="submit" className="sr-only">
                        跳转
                      </button>
                    </form>
                    {renderChunk(seq.slice(mid), mid)}
                  </>
                );
              })()}
            </div>
            {page < totalPages ? (
              <Link href={`${actionBase}${qs(page + 1)}`} className="pager-link shrink-0">
                下一页
              </Link>
            ) : (
              <span className="pager-disabled shrink-0">下一页</span>
            )}
            <span className="text-[11px] text-[var(--muted)]">
              第 {page}/{totalPages} 页
            </span>
          </nav>
        </div>
      ) : null}
    </section>
  );
}
