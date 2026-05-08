import { count, countDistinct } from "drizzle-orm";

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
    { label: "零件种类", value: partsRow[0]?.c ?? 0 },
    { label: "颜色", value: colorsRow[0]?.c ?? 0 },
    { label: "套装（去重 set_num）", value: setsRow[0]?.c ?? 0 },
    { label: "库存行（套装零件表）", value: invPartsRow[0]?.c ?? 0 },
    { label: "元素（零件+颜色）", value: elementsRow[0]?.c ?? 0 },
    { label: "零件关系", value: relRow[0]?.c ?? 0 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          你自己的 Rebrickable
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          数据来自仓库内{" "}
          <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-[var(--accent)]">
            assets/*.csv.gz
          </code>
          ，经{" "}
          <code className="rounded bg-[var(--surface)] px-1 py-0.5 text-[var(--accent)]">
            pnpm db:import
          </code>{" "}
          导入为本地 SQLite。无需官方 API Key，可离线浏览零件、套装清单与颜色。
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <li
            key={s.label}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
          >
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {s.label}
            </div>
            <div className="mt-1 font-mono text-2xl text-[var(--accent)]">
              {Number(s.value).toLocaleString("zh-CN")}
            </div>
          </li>
        ))}
      </ul>
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
        <p className="font-medium text-[var(--text)]">快速开始</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            将 Rebrickable 导出的 gz CSV 放入{" "}
            <code className="text-[var(--accent)]">assets/</code>
          </li>
          <li>
            运行 <code className="text-[var(--accent)]">pnpm install</code> 与{" "}
            <code className="text-[var(--accent)]">pnpm db:import</code>
          </li>
          <li>
            运行 <code className="text-[var(--accent)]">pnpm dev</code> 打开本页
          </li>
        </ol>
      </section>
    </div>
  );
}
