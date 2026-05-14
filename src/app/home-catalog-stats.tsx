import { count, eq } from "drizzle-orm";
import Link from "next/link";

import { getCatalogDb, getUserDb } from "@/db/client";
import { buildSavedPartsSheets, colors, legoSets, parts } from "@/db/schema";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

type CatalogStatTone = "violet" | "sky" | "amber" | "mint";

type CatalogStatItem = {
  id: string;
  title: string;
  caption: string;
  value: number;
  href: string;
  tone: CatalogStatTone;
};

function formatCount(n: number) {
  return Number(n).toLocaleString("zh-CN");
}

function CatalogStatTile({ item }: { item: CatalogStatItem }) {
  return (
    <li>
      <Link
        href={item.href}
        className={`catalog-stat-tile catalog-stat-tile--tone-${item.tone}`}
      >
        <div className="catalog-stat-tile-top">
          <span className="catalog-stat-title">{item.title}</span>
          <span className="catalog-stat-cta" aria-hidden="true">
            进入
          </span>
        </div>
        <div className="catalog-stat-value">{formatCount(item.value)}</div>
        <p className="catalog-stat-caption">{item.caption}</p>
      </Link>
    </li>
  );
}

export async function HomeCatalogStats() {
  const catalogDb = getCatalogDb();
  const userDb = getUserDb();
  const [mocsRow, setsRow, partsRow, colorsRow] = await Promise.all([
    userDb
      .select({ c: count() })
      .from(buildSavedPartsSheets)
      .where(eq(buildSavedPartsSheets.subjectKind, BUILD_SUBJECT_MOC)),
    catalogDb.select({ c: count() }).from(legoSets),
    catalogDb.select({ c: count() }).from(parts),
    catalogDb.select({ c: count() }).from(colors),
  ]);

  const items: CatalogStatItem[] = [
    {
      id: "mocs",
      title: "MOC",
      caption: "已在本地保存零件表的 MOC 数量（与 /mocs 列表一致）。",
      value: Number(mocsRow[0]?.c ?? 0),
      href: "/mocs",
      tone: "violet",
    },
    {
      id: "sets",
      title: "套装",
      caption: "由 sets.csv 导入的官方套装条目数。",
      value: Number(setsRow[0]?.c ?? 0),
      href: "/sets",
      tone: "sky",
    },
    {
      id: "parts",
      title: "零件",
      caption: "按 part_num 去重后的零件种类数。",
      value: Number(partsRow[0]?.c ?? 0),
      href: "/parts",
      tone: "amber",
    },
    {
      id: "colors",
      title: "颜色",
      caption: "调色板中的颜色定义条数。",
      value: Number(colorsRow[0]?.c ?? 0),
      href: "/colors",
      tone: "mint",
    },
  ];

  return (
    <section className="section-panel" aria-labelledby="catalog-stats-heading">
      <header className="catalog-stats-header">
        <p className="page-kicker">本地数据库</p>
        <h2 id="catalog-stats-heading" className="section-title text-[var(--text)]">
          目录规模
        </h2>
      </header>

      <div className="catalog-stats-body">
        <ul className="catalog-stats-grid catalog-stats-grid--quad">
          {items.map((item) => (
            <CatalogStatTile key={item.id} item={item} />
          ))}
        </ul>
      </div>
    </section>
  );
}
