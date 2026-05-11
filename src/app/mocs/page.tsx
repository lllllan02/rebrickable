import Image from "next/image";
import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocImages, mocProfiles, mocSavedPartsSheets } from "@/db/schema";
import { mocImagePublicPath } from "@/lib/moc-image-public-path";
import { parseTagsJson } from "@/lib/moc-profile-parse";

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

  const mocIds = rows.map((r) => r.mocId);

  const coverStoredByMoc = new Map<string, string>();
  const profileByMoc = new Map<string, { displayName: string; tags: string[] }>();

  if (mocIds.length > 0) {
    const [profiles, imgs] = await Promise.all([
      db.select().from(mocProfiles).where(inArray(mocProfiles.mocId, mocIds)),
      db
        .select({
          mocId: mocImages.mocId,
          storedFile: mocImages.storedFile,
          createdAt: mocImages.createdAt,
        })
        .from(mocImages)
        .where(inArray(mocImages.mocId, mocIds))
        .orderBy(asc(mocImages.createdAt)),
    ]);

    for (const p of profiles) {
      profileByMoc.set(p.mocId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
      });
    }
    for (const im of imgs) {
      if (!coverStoredByMoc.has(im.mocId)) {
        coverStoredByMoc.set(im.mocId, im.storedFile);
      }
    }
  }

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
          中编辑后可通过「保存到数据库」写入本地 SQLite；此处列出全部记录。封面取该 MOC{" "}
          <strong className="font-medium text-[var(--text)]">最早上传</strong> 的一张参考图；可在详情页修改显示名称与标签。
        </p>
      </section>
      <div className="table-shell overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-sm text-[var(--muted)]">
            尚无已存记录。请打开零件表导入 CSV 后保存到数据库。
          </p>
        ) : (
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th className="w-16 px-2 py-2 text-left">封面</th>
                <th className="px-2 py-2 text-left">名称</th>
                <th className="px-2 py-2 text-left">MOC ID</th>
                <th className="px-2 py-2 text-left">标签</th>
                <th className="px-2 py-2 text-right">行数</th>
                <th className="px-2 py-2 text-left">最近保存</th>
                <th className="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => {
                const prof = profileByMoc.get(r.mocId);
                const displayName = prof?.displayName?.trim() ?? "";
                const title = displayName || `MOC ${r.mocId}`;
                const tags = prof?.tags ?? [];
                const stored = coverStoredByMoc.get(r.mocId);
                const coverUrl = stored ? mocImagePublicPath(r.mocId, stored) : null;
                const detailHref = `/mocs/${encodeURIComponent(r.mocId)}`;

                return (
                  <tr key={r.mocId}>
                    <td className="px-2 py-1.5 align-middle">
                      <Link
                        href={detailHref}
                        className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-3)]"
                        aria-label={`${title} 封面`}
                      >
                        {coverUrl ? (
                          <Image
                            src={coverUrl}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="56px"
                            unoptimized
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]">
                            无图
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Link href={detailHref} className="text-sm font-medium text-[var(--text)] underline-offset-2 hover:underline">
                        {title}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 align-middle font-mono text-sm text-[var(--muted)]">{r.mocId}</td>
                    <td className="max-w-[12rem] px-2 py-1.5 align-middle">
                      {tags.length === 0 ? (
                        <span className="text-xs text-[var(--muted-2)]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((t, i) => (
                            <span
                              key={`${r.mocId}-${t}-${i}`}
                              className="rounded border border-[var(--border-soft)] bg-[var(--surface-2)] px-1.5 py-px text-[10px] text-[var(--text)]"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle font-mono text-sm tabular-nums text-[var(--text)]">
                      {r.lineCount.toLocaleString("zh-CN")}
                    </td>
                    <td className="px-2 py-1.5 align-middle text-sm text-[var(--muted)]">
                      {r.updatedAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-2 py-1.5 text-right align-middle">
                      <Link href={detailHref} className="text-sm text-[var(--accent)] underline">
                        打开
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
