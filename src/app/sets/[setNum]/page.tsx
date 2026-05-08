import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNotNull, min, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  colors,
  inventories,
  inventoryParts,
  legoSets,
  parts,
} from "@/db/schema";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ setNum: string }> };

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export default async function SetDetailPage({ params }: Props) {
  const { setNum: raw } = await params;
  const setNum = decodeURIComponent(raw);

  const db = getDb();
  const [[inv], [catalog]] = await Promise.all([
    db
      .select({
        id: inventories.id,
        version: inventories.version,
      })
      .from(inventories)
      .where(eq(inventories.setNum, setNum))
      .orderBy(desc(inventories.version))
      .limit(1),
    db
      .select({
        name: legoSets.name,
        year: legoSets.year,
        imgUrl: legoSets.imgUrl,
      })
      .from(legoSets)
      .where(eq(legoSets.setNum, setNum))
      .limit(1),
  ]);

  if (!inv) notFound();

  const setBoxImg =
    catalog && usableImgUrl(catalog.imgUrl) ? catalog.imgUrl.trim() : null;

  const imgClause = and(
    eq(inventoryParts.inventoryId, inv.id),
    isNotNull(inventoryParts.imgUrl),
    ne(inventoryParts.imgUrl, "")
  );

  const [lines, partHeroRow] = await Promise.all([
    db
      .select({
        partNum: inventoryParts.partNum,
        name: parts.name,
        colorId: inventoryParts.colorId,
        colorName: colors.name,
        rgb: colors.rgb,
        quantity: inventoryParts.quantity,
        isSpare: inventoryParts.isSpare,
        imgUrl: inventoryParts.imgUrl,
      })
      .from(inventoryParts)
      .innerJoin(parts, eq(inventoryParts.partNum, parts.partNum))
      .innerJoin(colors, eq(inventoryParts.colorId, colors.id))
      .where(eq(inventoryParts.inventoryId, inv.id))
      .orderBy(asc(inventoryParts.partNum), asc(inventoryParts.colorId)),
    setBoxImg
      ? Promise.resolve([{ thumb: null as string | null }])
      : db
          .select({ thumb: min(inventoryParts.imgUrl) })
          .from(inventoryParts)
          .where(imgClause),
  ]);

  const heroThumb = setBoxImg ?? partHeroRow[0]?.thumb ?? null;
  const heroIsSetBox = Boolean(setBoxImg);
  const sumQty = lines.reduce((a, l) => a + (l.isSpare ? 0 : l.quantity), 0);
  const spareQty = lines.reduce((a, l) => a + (l.isSpare ? l.quantity : 0), 0);
  const uniqueParts = new Set(lines.map((l) => l.partNum)).size;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-[var(--muted)]">
          <Link href="/sets" className="no-underline">
            ← 套装列表
          </Link>
        </p>
        <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="relative mx-auto aspect-square w-full max-w-[min(100%,16rem)] shrink-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] sm:mx-0 sm:w-56">
            {heroThumb ? (
              <Image
                src={heroThumb}
                alt={
                  heroIsSetBox
                    ? `${setNum} 套装盒照`
                    : `${setNum} 清单中的零件示意图`
                }
                width={224}
                height={224}
                className="box-border h-full w-full object-contain p-3"
                sizes="(max-width: 640px) 100vw, 224px"
                priority
              />
            ) : (
              <div
                className="flex aspect-square h-full min-h-[12rem] w-full items-center justify-center px-4 text-center text-sm text-[var(--muted)]"
                title="无盒图且无清单零件图；可将 Rebrickable 的 sets.csv.gz 放入 assets 后执行 pnpm db:import"
              >
                无图
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-mono text-2xl font-semibold text-[var(--accent)]">
              {setNum}
            </h1>
            {catalog?.name ? (
              <p className="mt-1 text-lg text-[var(--text)]">{catalog.name}</p>
            ) : null}
            <dl className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--muted)]">
              {catalog?.year != null ? (
                <div>
                  <dt className="inline text-[var(--text)]">年份：</dt>
                  <dd className="inline">{catalog.year}</dd>
                </div>
              ) : null}
              <div>
                <dt className="inline text-[var(--text)]">库存版本：</dt>
                <dd className="inline">{inv.version}</dd>
              </div>
              <div>
                <dt className="inline text-[var(--text)]">inventory_id：</dt>
                <dd className="inline font-mono">{inv.id}</dd>
              </div>
              <div>
                <dt className="inline text-[var(--text)]">零件种类：</dt>
                <dd className="inline">
                  {uniqueParts.toLocaleString("zh-CN")}
                </dd>
              </div>
              <div>
                <dt className="inline text-[var(--text)]">主件：</dt>
                <dd className="inline">
                  {sumQty.toLocaleString("zh-CN")} 粒
                </dd>
              </div>
              <div>
                <dt className="inline text-[var(--text)]">备用件：</dt>
                <dd className="inline">
                  {spareQty.toLocaleString("zh-CN")} 粒
                </dd>
              </div>
            </dl>
            {!heroIsSetBox && heroThumb ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                当前为清单中的零件示意图；导入{" "}
                <code className="text-[var(--accent)]">sets.csv.gz</code>{" "}
                并重新执行 <code className="text-[var(--accent)]">pnpm db:import</code>{" "}
                后可显示官方套装盒图。
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">零件清单</h2>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="w-14 px-2 py-2" aria-label="图示" />
                <th className="px-2 py-2">零件</th>
                <th className="px-2 py-2">名称</th>
                <th className="px-2 py-2">颜色</th>
                <th className="px-2 py-2 text-right">数量</th>
                <th className="px-2 py-2">备用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {lines.map((l, i) => (
                <tr key={`${l.partNum}-${l.colorId}-${l.isSpare}-${i}`}>
                  <td className="px-2 py-1.5 align-middle">
                    <div className="relative mx-auto h-11 w-11 overflow-hidden rounded border border-[var(--border)] bg-[var(--bg)]">
                      {l.imgUrl ? (
                        <Image
                          src={l.imgUrl}
                          alt=""
                          width={44}
                          height={44}
                          className="box-border h-full w-full object-contain p-0.5"
                          sizes="44px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[8px] text-[var(--muted)]">
                          无
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 align-middle font-mono">
                    <Link
                      href={`/parts/${encodeURIComponent(l.partNum)}`}
                      className="text-[var(--accent)] no-underline"
                    >
                      {l.partNum}
                    </Link>
                  </td>
                  <td className="max-w-[min(280px,28vw)] truncate px-2 py-1.5 align-middle text-[var(--muted)]">
                    {l.name}
                  </td>
                  <td className="px-2 py-1.5 align-middle">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 shrink-0 rounded border border-[var(--border)]"
                        style={{ background: `#${l.rgb}` }}
                        title={l.rgb}
                      />
                      <span>{l.colorName}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right align-middle font-mono">
                    {l.quantity}
                  </td>
                  <td className="px-2 py-1.5 align-middle text-[var(--muted)]">
                    {l.isSpare ? (
                      <span className="rounded px-1 py-px text-[10px] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/40">
                        备用
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">该清单暂无零件行。</p>
        ) : null}
      </section>
    </div>
  );
}
