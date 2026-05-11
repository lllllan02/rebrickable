import Link from "next/link";
import { desc } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocSavedPartsSheets } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function MocsPage() {
  const db = getDb();
  const rows = await db
    .select({
      mocId: mocSavedPartsSheets.mocId,
      lineCount: mocSavedPartsSheets.lineCount,
      updatedAt: mocSavedPartsSheets.updatedAt,
    })
    .from(mocSavedPartsSheets)
    .orderBy(desc(mocSavedPartsSheets.updatedAt));

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">MOC</p>
        <h1 className="page-title">已存零件表（按 MOC）</h1>
        <p className="page-description">
          在{" "}
          <Link href="/parts-sheet" className="underline">
            零件表
          </Link>{" "}
          中编辑后可通过「保存到数据库」写入本地 SQLite；此处列出全部记录，并可跳转回零件表继续编辑。
        </p>
      </section>
      <div className="table-shell">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-sm text-[var(--muted)]">
            尚无已存记录。请打开零件表导入 CSV 后保存到数据库。
          </p>
        ) : (
          <table className="data-table min-w-[480px]">
            <thead>
              <tr>
                <th className="px-2 py-2 text-left">MOC ID</th>
                <th className="px-2 py-2 text-right">行数</th>
                <th className="px-2 py-2 text-left">最近保存</th>
                <th className="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.mocId}>
                  <td className="px-2 py-1.5 font-mono text-sm">{r.mocId}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">
                    {r.lineCount.toLocaleString("zh-CN")}
                  </td>
                  <td className="px-2 py-1.5 text-sm text-[var(--muted)]">
                    {r.updatedAt.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Link
                      href={`/parts-sheet?loadMoc=${encodeURIComponent(r.mocId)}`}
                      className="text-sm text-[var(--accent)] underline"
                    >
                      在零件表中打开
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
