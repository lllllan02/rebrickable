import Link from "next/link";

import { BuildFavoriteToggle } from "@/app/build/build-favorite-toggle";
import { BuildOwnedToggle } from "@/app/build/build-owned-toggle";
import { GobricksShortageListInlineCheck } from "@/app/build/gobricks-shortage-list-check-button";
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
  shortageLineCount,
  shortageTotalQty,
  shortageClearedAt,
  gobricksShortageSyncAt,
  gobricksGdsPriceCny = null,
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
  /** 缺件表行数；null 表示无缺件表或未写入汇总 */
  shortageLineCount: number | null;
  /** 缺件表各行列 quantity 之和 */
  shortageTotalQty: number | null;
  /** 用户「标记为不缺」写入的时间（ISO）；仅非空时表示已确认无缺件表 */
  shortageClearedAt: string | null;
  /** 最近一次高砖缺件对照成功的时间（ISO） */
  gobricksShortageSyncAt: string | null;
  /** 高砖整单参考价（元），接口 `gdsPrice` 分片之和；未对照时为 null */
  gobricksGdsPriceCny?: number | null;
}) {
  const coverImageClassName = kind === BUILD_SUBJECT_SET ? "object-contain p-3" : "object-cover";
  const savedAt = updatedAtIso.slice(0, 19).replace("T", " ");
  const hasShortage = shortageLineCount != null && shortageLineCount > 0;
  const markedNoShortage =
    typeof shortageClearedAt === "string" && shortageClearedAt.trim().length > 0;

  const gobricksGdsLabel =
    typeof gobricksGdsPriceCny === "number" &&
    Number.isFinite(gobricksGdsPriceCny) &&
    gobricksGdsPriceCny >= 0
      ? new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" }).format(gobricksGdsPriceCny)
      : null;

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
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <Link
              href={detailHref}
              className="min-w-0 max-w-full line-clamp-2 text-base font-semibold leading-snug text-[var(--text)] underline-offset-2 hover:underline"
            >
              {title}
            </Link>
            {gobricksGdsLabel ? (
              <span
                className="shrink-0 font-mono text-sm font-semibold tabular-nums text-emerald-200/95"
                title="高砖整单参考价（接口 gdsPrice，按完整清单分片求和）"
              >
                {gobricksGdsLabel}
              </span>
            ) : null}
          </div>
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
        <div className="mt-auto min-w-0 border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--muted)]">
          <div className="flex min-w-0 flex-col gap-1.5">
            <GobricksShortageListInlineCheck
              subjectKind={kind}
              subjectId={subjectId}
              totalPartQty={totalPartQty}
              hasShortage={hasShortage}
              shortageLineCount={shortageLineCount}
              shortageTotalQty={shortageTotalQty}
              markedNoShortage={markedNoShortage}
              gobricksShortageSyncAt={gobricksShortageSyncAt}
            />
            <div className="text-left tabular-nums">
              <span className="text-[var(--muted-2)]">保存时间 </span>
              <time dateTime={updatedAtIso}>{savedAt}</time>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
