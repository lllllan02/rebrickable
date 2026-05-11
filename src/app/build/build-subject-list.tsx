import Image from "next/image";
import Link from "next/link";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { BuildPartsSheetUpload } from "@/app/build/build-parts-sheet-upload";
import { getDb } from "@/db/client";
import { buildImages, buildProfiles, buildSavedPartsSheets } from "@/db/schema";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { buildImagePublicPath } from "@/lib/build-image-public-path";
import { buildSubjectUi } from "@/lib/build-ui";
import { parseTagsJson } from "@/lib/moc-profile-parse";

export async function BuildSubjectListPage({ kind }: { kind: BuildSubjectKind }) {
  const ui = buildSubjectUi(kind);
  const db = getDb();
  const rows = await db
    .select({
      subjectId: buildSavedPartsSheets.subjectId,
      totalPartQty: buildSavedPartsSheets.totalPartQty,
      updatedAt: buildSavedPartsSheets.updatedAt,
    })
    .from(buildSavedPartsSheets)
    .where(eq(buildSavedPartsSheets.subjectKind, kind))
    .orderBy(desc(buildSavedPartsSheets.updatedAt));

  const subjectIds = rows.map((r) => r.subjectId);

  const coverStored = new Map<string, string>();
  const profileBySubject = new Map<string, { displayName: string; tags: string[] }>();

  if (subjectIds.length > 0) {
    const [profiles, imgs] = await Promise.all([
      db
        .select()
        .from(buildProfiles)
        .where(and(eq(buildProfiles.subjectKind, kind), inArray(buildProfiles.subjectId, subjectIds))),
      db
        .select({
          subjectId: buildImages.subjectId,
          storedFile: buildImages.storedFile,
          createdAt: buildImages.createdAt,
        })
        .from(buildImages)
        .where(and(eq(buildImages.subjectKind, kind), inArray(buildImages.subjectId, subjectIds)))
        .orderBy(asc(buildImages.createdAt)),
    ]);

    for (const p of profiles) {
      profileBySubject.set(p.subjectId, {
        displayName: (p.displayName ?? "").trim(),
        tags: parseTagsJson(p.tagsJson),
      });
    }
    for (const im of imgs) {
      if (!coverStored.has(im.subjectId)) {
        coverStored.set(im.subjectId, im.storedFile);
      }
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">{ui.listKicker}</p>
        <h1 className="page-title">
          {ui.noun} {ui.listTitleSuffix}
        </h1>
        <p className="page-description">
          在下方上传缺货表 CSV 后，将在临时预览页核对并保存到本地 SQLite；此处列出全部已存{ui.noun}。封面取该{ui.noun}{" "}
          <strong className="font-medium text-[var(--text)]">最早上传</strong> 的一张参考图；可在详情页修改显示名称与标签。
        </p>
      </section>
      <BuildPartsSheetUpload kind={kind} />
      <div className="table-shell">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-sm text-[var(--muted)]">
            尚无已存记录。请使用上方上传入口导入 CSV，在预览页保存到数据库。
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const prof = profileBySubject.get(r.subjectId);
              const displayName = prof?.displayName?.trim() ?? "";
              const title = displayName || `${ui.noun} ${r.subjectId}`;
              const tags = prof?.tags ?? [];
              const stored = coverStored.get(r.subjectId);
              const coverUrl = stored ? buildImagePublicPath(kind, r.subjectId, stored) : null;
              const detailHref = buildSubjectDetailPath(kind, r.subjectId);
              const savedAt = r.updatedAt.slice(0, 19).replace("T", " ");

              return (
                <li key={r.subjectId} className="result-card flex flex-col gap-0 overflow-hidden p-0">
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
                      <p className="mt-1 truncate font-mono text-xs text-[var(--muted)]" title={r.subjectId}>
                        {r.subjectId}
                      </p>
                    </div>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t, i) => (
                          <span
                            key={`${r.subjectId}-${t}-${i}`}
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
      {kind !== BUILD_SUBJECT_MOC ? (
        <p className="text-center text-xs text-[var(--muted)]">
          <Link href="/sets/catalog" className="text-[var(--accent)] underline underline-offset-2">
            套装目录
          </Link>
          ：按 set_num 浏览导入的全部官方清单（与上方「已存零件表」独立）。
        </p>
      ) : null}
    </div>
  );
}
