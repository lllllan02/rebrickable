import Link from "next/link";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import {
  OWNED_PARTS_BATCH_SIZE,
  loadOwnedCategoryLabel,
  loadOwnedCategorySummary,
  loadOwnedPartCardsFiltered,
} from "@/lib/load-owned-parts";
import {
  ownedCategoryQueryValue,
  parseOwnedCategoryParam,
} from "@/lib/owned-parts-category";
import { serializeOwnedPartCards } from "@/lib/serialize-owned-part-cards";

import { OwnedPartsInfiniteGrid } from "./owned-parts-infinite-grid";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ cat?: string }>;
};

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function ownedCatHref(filter: "all" | "uncategorized" | number): string {
  const value = ownedCategoryQueryValue(filter);
  return `/parts/owned?cat=${encodeURIComponent(value)}`;
}

export default async function OwnedPartsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const catRaw = (sp.cat ?? "").trim();
  const categoryFilter = parseOwnedCategoryParam(catRaw);
  const invalidCatParam = catRaw.length > 0 && categoryFilter == null;

  const { stats, categories, uncategorizedCount } = await loadOwnedCategorySummary();
  const showCategoryPicker = categoryFilter == null && !invalidCatParam;

  const categoryLabel =
    categoryFilter != null ? await loadOwnedCategoryLabel(categoryFilter) : null;

  const initialBatch =
    categoryFilter != null
      ? await loadOwnedPartCardsFiltered(categoryFilter, 0, OWNED_PARTS_BATCH_SIZE)
      : null;
  const initialCards =
    initialBatch != null ? await serializeOwnedPartCards(initialBatch.rows) : [];

  return (
    <div className="page-stack">
      <header className="hero-panel">
        <p className="page-kicker">本地标记</p>
        <h1 className="page-title text-xl sm:text-2xl">零件库</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          由官方套装「杀肉」写入的零件库存，按零件号与颜色分别记录数量。也可在
          <Link href="/parts" className="mx-1 text-[var(--accent)] underline underline-offset-2">
            零件目录
          </Link>
          中查看单个零件详情。
        </p>
        {stats.uniqueParts > 0 ? (
          <p className="mt-2 text-sm tabular-nums text-[var(--text)]">
            {stats.uniqueParts.toLocaleString("zh-CN")} 种零件 ·{" "}
            {stats.totalRows.toLocaleString("zh-CN")} 条 · {stats.totalQty.toLocaleString("zh-CN")}{" "}
            粒
          </p>
        ) : null}
      </header>

      {stats.uniqueParts === 0 ? (
        <section className="section-panel">
          <p className="text-sm text-[var(--muted)]">
            零件库尚无记录。在已标记为「拥有」的官方套装详情页点击「杀肉」，即可将官方库存零件转入此清单。
          </p>
        </section>
      ) : showCategoryPicker ? (
        <section className="section-panel">
          <p className="mb-4 text-sm leading-relaxed text-[var(--muted)]">
            先选择零件类型（分类）浏览该类下的零件库；也可查看全部，滚动到底部会自动加载更多。
          </p>
          <div className="mb-6 flex flex-wrap gap-3">
            <Link
              href={ownedCatHref("all")}
              className="result-card inline-flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
            >
              <span className="text-sm font-semibold text-[var(--text)]">全部零件库</span>
              <span className="text-xs tabular-nums text-[var(--muted)]">
                {stats.totalRows.toLocaleString("zh-CN")} 条
              </span>
            </Link>
            {uncategorizedCount > 0 ? (
              <Link
                href={ownedCatHref("uncategorized")}
                className="result-card inline-flex min-w-[min(100%,14rem)] flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
              >
                <span className="text-sm font-semibold text-[var(--text)]">未分类</span>
                <span className="text-xs tabular-nums text-[var(--muted)]">
                  {uncategorizedCount.toLocaleString("zh-CN")} 条
                </span>
              </Link>
            ) : null}
          </div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text)]">按分类浏览</h2>
          {categories.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">暂无已分类的零件库条目。</p>
          ) : (
            <ul
              className="list-cards-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
              role="list"
            >
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="result-card flex min-w-0 flex-col gap-0 overflow-hidden p-0"
                >
                  <Link
                    href={ownedCatHref(c.id)}
                    className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]"
                    aria-label={`${c.name} 示意缩略图`}
                  >
                    {usableImgUrl(c.hero) ? (
                      <RemoteCoverImage
                        src={c.hero.trim()}
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
                        href={ownedCatHref(c.id)}
                        className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                        {c.count.toLocaleString("zh-CN")} 条
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="section-panel">
          {invalidCatParam ? (
            <p className="mb-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)]">
              分类参数无效，请从{" "}
              <Link
                href="/parts/owned"
                className="text-[var(--accent)] underline-offset-2 hover:underline"
              >
                分类列表
              </Link>{" "}
              重新选择。
            </p>
          ) : null}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              {categoryLabel ? (
                <>
                  当前分类：<span className="text-[var(--text)]">{categoryLabel}</span>
                  {initialBatch ? (
                    <span className="tabular-nums">
                      {" "}
                      · 共 {initialBatch.totalRows.toLocaleString("zh-CN")} 条
                    </span>
                  ) : null}
                </>
              ) : null}
              <span className="block sm:inline">
                {" "}
                每张卡片对应一种零件的一种颜色；滚动到底自动加载更多。
              </span>
            </p>
            <Link
              href="/parts/owned"
              className="shrink-0 text-sm text-[var(--accent)] underline-offset-2 hover:underline"
            >
              ← 选择分类
            </Link>
          </div>
          {categoryFilter != null && initialBatch != null ? (
            initialBatch.totalRows === 0 ? (
              <p className="text-sm text-[var(--muted)]">该分类下暂无零件库记录。</p>
            ) : (
              <OwnedPartsInfiniteGrid
                key={ownedCategoryQueryValue(categoryFilter)}
                initialCards={initialCards}
                categoryQuery={ownedCategoryQueryValue(categoryFilter)}
                initialHasMore={initialBatch.hasMore}
                totalRows={initialBatch.totalRows}
              />
            )
          ) : null}
        </section>
      )}
    </div>
  );
}
