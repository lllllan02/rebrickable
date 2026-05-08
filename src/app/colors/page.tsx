import { asc } from "drizzle-orm";

import { getDb } from "@/db/client";
import { colors } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ColorsPage() {
  const db = getDb();
  const rows = await db
    .select()
    .from(colors)
    .orderBy(asc(colors.id));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">颜色</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          来自 Rebrickable{" "}
          <code className="text-[var(--accent)]">colors.csv</code>，共{" "}
          {rows.length} 条。
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs uppercase text-[var(--muted)]">
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
              <tr key={c.id}>
                <td className="px-2 py-1.5 font-mono">{c.id}</td>
                <td className="px-2 py-1.5">
                  <span
                    className="inline-block h-6 w-10 rounded border border-[var(--border)]"
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
