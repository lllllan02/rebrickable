import Link from "next/link";

import { PartGridTileLink } from "@/components/part-grid-tile-link";
import { loadOwnedPartCards, loadOwnedPartCatalogMeta } from "@/lib/load-owned-parts";

export const dynamic = "force-dynamic";

function partColorKey(partNum: string, colorId: number): string {
  return `${partNum}\0${colorId}`;
}

export default async function OwnedPartsPage() {
  const { rows, truncated, totalQty, uniqueParts } = await loadOwnedPartCards();

  const partNums = [...new Set(rows.map((r) => r.partNum))];
  const { nameByNum, thumbByNum, thumbByPartColor, printedPartNums } =
    await loadOwnedPartCatalogMeta(
      partNums,
      rows.map((r) => ({ partNum: r.partNum, colorId: r.colorId }))
    );

  return (
    <div className="page-stack">
      <header className="hero-panel">
        <p className="page-kicker">本地标记</p>
        <h1 className="page-title text-xl sm:text-2xl">散装拥有</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          由官方套装「杀肉」写入的零件库存，按零件号与颜色分别记录数量。也可在
          <Link href="/parts" className="mx-1 text-[var(--accent)] underline underline-offset-2">
            零件目录
          </Link>
          中查看单个零件详情。
        </p>
        {uniqueParts > 0 ? (
          <p className="mt-2 text-sm tabular-nums text-[var(--text)]">
            {uniqueParts.toLocaleString("zh-CN")} 种零件 · {rows.length.toLocaleString("zh-CN")}{" "}
            条 · {totalQty.toLocaleString("zh-CN")} 粒
          </p>
        ) : null}
      </header>

      {uniqueParts === 0 ? (
        <section className="section-panel">
          <p className="text-sm text-[var(--muted)]">
            尚无散装拥有记录。在已标记为「拥有」的官方套装详情页点击「杀肉」，即可将官方库存零件转入此清单。
          </p>
        </section>
      ) : (
        <section className="section-panel">
          <p className="mb-3 text-sm leading-relaxed text-[var(--muted)]">
            每张卡片对应一种零件的一种颜色；右上角数字为该颜色拥有数量。
          </p>
          <ul className="tiles-grid" role="list">
            {rows.map((row) => {
              const name = nameByNum.get(row.partNum) ?? "";
              const thumb =
                thumbByPartColor.get(partColorKey(row.partNum, row.colorId)) ??
                thumbByNum.get(row.partNum) ??
                null;
              const detailHref = `/parts/${encodeURIComponent(row.partNum)}`;
              const isPrinted = printedPartNums.has(row.partNum);
              const title = [
                row.partNum,
                name,
                row.colorName,
                isPrinted ? "印刷件" : null,
                `×${row.quantity}`,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={partColorKey(row.partNum, row.colorId)} className="min-w-0">
                  <PartGridTileLink
                    href={detailHref}
                    titleAttr={title}
                    partNum={row.partNum}
                    thumbUrl={thumb}
                    isPrinted={isPrinted}
                    topRight={
                      <span
                        className="pointer-events-none absolute right-1 top-1 z-[2] rounded border border-white/15 bg-black/70 px-1 py-px text-[10px] font-semibold tabular-nums leading-none text-white shadow-sm"
                        aria-label={`拥有数量 ${row.quantity}`}
                      >
                        {row.quantity.toLocaleString("zh-CN")}
                      </span>
                    }
                  >
                    <p className="mt-0.5 line-clamp-2 px-0.5 text-center text-[9px] leading-tight text-[var(--muted-2)]">
                      {row.colorName}
                    </p>
                  </PartGridTileLink>
                </li>
              );
            })}
          </ul>
          {truncated ? (
            <p className="mt-3 text-xs text-[var(--muted)]">仅展示前 500 条，其余已省略。</p>
          ) : null}
        </section>
      )}
    </div>
  );
}
