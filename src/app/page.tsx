import { count, countDistinct } from "drizzle-orm";
import Link from "next/link";

import { getDb } from "@/db/client";
import {
  colors,
  elements,
  inventories,
  inventoryParts,
  parts,
  partRelationships,
} from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const db = getDb();
  const [
    partsRow,
    colorsRow,
    setsRow,
    invPartsRow,
    elementsRow,
    relRow,
  ] = await Promise.all([
    db.select({ c: count() }).from(parts),
    db.select({ c: count() }).from(colors),
    db.select({ c: countDistinct(inventories.setNum) }).from(inventories),
    db.select({ c: count() }).from(inventoryParts),
    db.select({ c: count() }).from(elements),
    db.select({ c: count() }).from(partRelationships),
  ]);

  const stats = [
    { label: "零件种类", value: partsRow[0]?.c ?? 0, href: "/parts" },
    { label: "颜色", value: colorsRow[0]?.c ?? 0, href: "/colors" },
    { label: "套装（去重 set_num）", value: setsRow[0]?.c ?? 0, href: "/sets" },
    {
      label: "库存行（套装零件表）",
      value: invPartsRow[0]?.c ?? 0,
      href: "/sets",
    },
    { label: "元素（零件+颜色）", value: elementsRow[0]?.c ?? 0, href: "/parts" },
    { label: "零件关系", value: relRow[0]?.c ?? 0, href: "/parts" },
  ];

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">Local brick catalog</p>
        <h1 className="page-title">你自己的 Rebrickable</h1>
        <p className="page-description">
          数据来自仓库内{" "}
          <code className="code-pill">assets/*.csv.gz</code>
          ，经{" "}
          <code className="code-pill">pnpm db:import</code>{" "}
          导入为本地 SQLite。无需官方 API Key，可离线浏览零件、套装清单与颜色。
        </p>
      </section>
      <ul className="stat-grid">
        {stats.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="stat-card stat-link">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">
                {Number(s.value).toLocaleString("zh-CN")}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <section className="section-panel text-sm text-[var(--muted)]">
        <p className="section-title text-[var(--text)]">快速开始</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            将 Rebrickable 导出的 gz CSV 放入{" "}
            <code className="code-pill">assets/</code>
            （建议包含 <code className="code-pill">sets.csv.gz</code> 与{" "}
            <code className="code-pill">themes.csv.gz</code>
            ，以便套装列表显示盒图与主题名）
          </li>
          <li>
            运行 <code className="code-pill">pnpm install</code> 与{" "}
            <code className="code-pill">pnpm db:import</code>
          </li>
          <li>
            运行 <code className="code-pill">pnpm dev</code> 打开本页
          </li>
        </ol>
      </section>
    </div>
  );
}
