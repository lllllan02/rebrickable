import { asc } from "drizzle-orm";

import { getDb } from "@/db/client";
import { colorDomId } from "@/lib/dom-anchors";
import { colors } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ColorsPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(colors)
    .orderBy(asc(colors.id));

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">Colors</p>
        <h1 className="page-title">颜色</h1>
        <p className="page-description">
          来自 Rebrickable{" "}
          <code className="code-pill">colors.csv</code>，共{" "}
          {rows.length} 条。
        </p>
      </section>
      <div className="table-shell">
        <table className="data-table min-w-[520px]">
          <thead>
            <tr>
              <th className="px-2 py-2">id</th>
              <th className="px-2 py-2">色块</th>
              <th className="px-2 py-2">名称</th>
              <th className="px-2 py-2">RGB</th>
              <th className="px-2 py-2">透明</th>
              <th className="px-2 py-2 text-right">零件数</th>
              <th className="px-2 py-2 text-right">套装数</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((c) => (
              <tr key={c.id} id={colorDomId(c.id)} className="scroll-mt-24">
                <td className="px-2 py-1.5 font-mono">{c.id}</td>
                <td className="px-2 py-1.5">
                  <span
                    className="color-swatch h-6 w-10"
                    style={{ background: `#${c.rgb}` }}
                  />
                </td>
                <td className="px-2 py-1.5">{c.name}</td>
                <td className="px-2 py-1.5 font-mono text-[var(--muted)]">
                  #{c.rgb}
                </td>
                <td className="px-2 py-1.5">{c.isTrans ? "是" : ""}</td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {c.numParts?.toLocaleString("zh-CN") ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {c.numSets?.toLocaleString("zh-CN") ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
