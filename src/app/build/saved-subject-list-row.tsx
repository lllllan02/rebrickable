import Link from "next/link";

import { BuildFavoriteToggle } from "@/app/build/build-favorite-toggle";
import { BuildOwnedToggle } from "@/app/build/build-owned-toggle";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { BUILD_SUBJECT_MOC, BUILD_SUBJECT_SET, type BuildSubjectKind } from "@/lib/build-subject";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

/**
 * 与 `BuildSubjectListPage` 已存 MOC/套装列表中单卡 DOM 完全一致（拥有 / 搜索等页复用）。
 */
export function SavedSubjectListRow({
  kind,
  subjectId,
  detailHref,
  title,
  coverUrl,
  tags,
  mocTagHref,
  totalPartQty,
  updatedAtIso,
  owned,
  favorite,
  showInstructionBadge,
  showSourceBadge,
}: {
  kind: BuildSubjectKind;
  subjectId: string;
  detailHref: string;
  title: string;
  coverUrl: string | null;
  tags: string[];
  /** 仅 MOC：标签链向 `/mocs?tag=`；套装传 undefined 则标签渲染为 span */
  mocTagHref?: (tag: string) => string;
  totalPartQty: number;
  updatedAtIso: string;
  owned: boolean;
  favorite: boolean;
  showInstructionBadge: boolean;
  showSourceBadge: boolean;
}) {
  const coverImageClassName = kind === BUILD_SUBJECT_SET ? "object-contain p-3" : "object-cover";
  const savedAt = updatedAtIso.slice(0, 19).replace("T", " ");

  return (
    <li
      className={`result-card flex flex-col gap-0 overflow-hidden p-0${owned ? " result-card--owned" : favorite ? " result-card--favorite" : ""}`}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden border-b border-[var(--border)] bg-[var(--surface-3)]">
        <Link href={detailHref} className="absolute inset-0 z-0 block" aria-label={`${title} 封面`}>
          {usableImgUrl(coverUrl) ? (
            <RemoteCoverImage
              src={coverUrl.trim()}
              fill
              className={coverImageClassName}
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              alt=""
              fallbackLabel="无参考图"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm text-[var(--muted)]">无参考图</span>
          )}
        </Link>
        {showInstructionBadge || showSourceBadge ? (
          <div className="pointer-events-none absolute right-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1">
            <div className="flex flex-wrap justify-end gap-1">
              {showInstructionBadge ? (
                <span
                  className="rounded-md bg-gradient-to-br from-amber-400 to-orange-600 px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-white shadow-md ring-1 ring-white/35 sm:text-[10px]"
                  title="含 PDF 说明书"
                >
                  PDF
                </span>
              ) : null}
              {showSourceBadge ? (
                <span
                  className="rounded-md bg-gradient-to-br from-sky-500 to-indigo-600 px-1 py-0.5 text-[9px] font-bold uppercase leading-none tracking-wide text-white shadow-md ring-1 ring-white/35 sm:text-[10px]"
                  title="含 Studio .io 源文件"
                >
                  IO
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-2 right-2 z-10">
          <div className="pointer-events-auto flex flex-row gap-1">
            <BuildFavoriteToggle subjectKind={kind} subjectId={subjectId} initialFavorite={favorite} />
            <BuildOwnedToggle subjectKind={kind} subjectId={subjectId} initialOwned={owned} />
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3.5">
        <div className="min-w-0">
          <Link
            href={detailHref}
            className="line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
          >
            {title}
          </Link>
          <p className="mt-1 truncate font-mono text-xs text-[var(--muted)]" title={subjectId}>
            {subjectId}
          </p>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t, i) =>
              kind === BUILD_SUBJECT_MOC && mocTagHref != null ? (
                <Link
                  key={`${subjectId}-${t}-${i}`}
                  href={mocTagHref(t)}
                  className="rounded border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text)] underline-offset-2 hover:border-[var(--accent)]/40 hover:underline"
                >
                  {t}
                </Link>
              ) : (
                <span
                  key={`${subjectId}-${t}-${i}`}
                  className="rounded border border-[var(--border-soft)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text)]"
                >
                  {t}
                </span>
              ),
            )}
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--muted)]">
          <span className="tabular-nums text-[var(--text)]">
            <span className="text-[var(--muted-2)]">零件总数 </span>
            {totalPartQty.toLocaleString("zh-CN")}
          </span>
          <span className="shrink-0 text-right tabular-nums">
            <span className="text-[var(--muted-2)]">保存时间 </span>
            <time dateTime={updatedAtIso}>{savedAt}</time>
          </span>
        </div>
      </div>
    </li>
  );
}
