import Image from "next/image";
import Link from "next/link";
import { asc, desc, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocImages, mocProfiles, mocSavedPartsSheets } from "@/db/schema";
import { mocImagePublicPath } from "@/lib/moc-image-public-path";
import { parseTagsJson } from "@/lib/moc-profile-parse";

import { MocsPartsSheetUpload } from "./mocs-parts-sheet-upload";

export const dynamic = "force-dynamic";

export default async function MocsPage() {
  const db = getDb();
  const rows = await db
    .select({
      mocId: mocSavedPartsSheets.mocId,
      totalPartQty: mocSavedPartsSheets.totalPartQty,
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
        <h1 className="page-title">MOC 与已存零件表</h1>
        <p className="page-description">
          在下方上传缺货表 CSV 后，将在临时预览页核对并保存到本地 SQLite；此处列出全部已存 MOC。封面取该 MOC{" "}
          <strong className="font-medium text-[var(--text)]">最早上传</strong> 的一张参考图；可在详情页修改显示名称与标签。
        </p>
      </section>
      <MocsPartsSheetUpload />
      <div className="table-shell">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-sm text-[var(--muted)]">
            尚无已存记录。请使用上方上传入口导入 CSV，在预览页保存到数据库。
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const prof = profileByMoc.get(r.mocId);
              const displayName = prof?.displayName?.trim() ?? "";
              const title = displayName || `MOC ${r.mocId}`;
              const tags = prof?.tags ?? [];
              const stored = coverStoredByMoc.get(r.mocId);
              const coverUrl = stored ? mocImagePublicPath(r.mocId, stored) : null;
              const detailHref = `/mocs/${encodeURIComponent(r.mocId)}`;
              const savedAt = r.updatedAt.slice(0, 19).replace("T", " ");

              return (
                <li key={r.mocId} className="result-card flex flex-col gap-0 overflow-hidden p-0">
                  <Link
                    href={detailHref}
                    className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]"
                    aria-label={`${title} 封面`}
                  >
                    {coverUrl ? (
                      <Image
                        src={coverUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">
                        无参考图
                      </span>
                    )}
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
                    <div className="min-w-0">
                      <Link
                        href={detailHref}
                        className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
                      >
                        {title}
                      </Link>
                      <p className="mt-1 truncate font-mono text-xs text-[var(--muted)]" title={r.mocId}>
                        {r.mocId}
                      </p>
                    </div>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t, i) => (
                          <span
                            key={`${r.mocId}-${t}-${i}`}
                            className="rounded border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text)]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--muted)]">
                      <span className="tabular-nums text-[var(--text)]">
                        <span className="text-[var(--muted-2)]">零件总数 </span>
                        {r.totalPartQty.toLocaleString("zh-CN")}
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className="text-[var(--muted-2)]">保存时间 </span>
                        <time dateTime={r.updatedAt}>{savedAt}</time>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
