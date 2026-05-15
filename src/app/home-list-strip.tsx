import Link from "next/link";
import type { ReactNode } from "react";

/** 首页「我的 / 收藏」每类最多 `previewCap` 条栅格预览，其余仅靠外链进入列表查看 */
export function HomeListStrip({
  heading,
  total,
  moreHref,
  moreLabel = "在列表中查看全部",
  previewCap,
  overflowHint,
  hideCategoryTitle = false,
  children,
}: {
  heading: string;
  total: number;
  moreHref: string;
  moreLabel?: string;
  /** 首页最多展示条数（多出不渲染，由外链查看） */
  previewCap: number;
  /** 条目超出 `previewCap` 时追加说明；不传则给通用一句 */
  overflowHint?: ReactNode;
  /** 大板块内 Tab 等场景：不重复显示分类标题，仅保留条数与链接 */
  hideCategoryTitle?: boolean;
  children: ReactNode;
}) {
  if (total <= 0) return null;
  const rest = total - previewCap;
  const overflow = rest > 0;
  const defaultOverflowHint = (
    <>
      另有 <span className="tabular-nums font-medium text-[var(--text)]">{rest.toLocaleString("zh-CN")}</span>{" "}
      条未在此列出，请使用上方链接跳转查看。
    </>
  );
  return (
    <div className="mb-6 last:mb-0">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        {hideCategoryTitle ? (
          <p className="text-sm text-[var(--muted)] tabular-nums">
            共 <strong className="font-medium text-[var(--text)]">{total.toLocaleString("zh-CN")}</strong> 条
          </p>
        ) : (
          <h3 className="section-title text-base text-[var(--text)]">
            {heading}
            <span className="ml-2 font-normal text-sm text-[var(--muted)] tabular-nums">
              （{total.toLocaleString("zh-CN")}）
            </span>
          </h3>
        )}
        <Link href={moreHref} className="shrink-0 text-sm text-[var(--accent)] underline underline-offset-2">
          {moreLabel}
        </Link>
      </div>
      {overflow ? (
        <p className="mb-2 text-xs text-[var(--muted)]">{overflowHint ?? defaultOverflowHint}</p>
      ) : null}
      <ul className="list-cards-grid grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">{children}</ul>
    </div>
  );
}
