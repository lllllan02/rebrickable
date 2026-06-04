import Link from "next/link";
import type { ReactNode } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import { PART_GRID_TILE_CLASS_BASE } from "@/lib/part-grid-tile-classes";

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

/** 零件列表 / 全站搜索等共用的方格缩略图链接（与 `tiles-grid` 搭配） */
export function PartGridTileLink({
  href,
  titleAttr,
  partNum,
  thumbUrl,
  isPrinted,
  extraTileClass = "",
  topRight,
  children,
}: {
  href: string;
  titleAttr: string;
  partNum: string;
  thumbUrl: string | null | undefined;
  isPrinted?: boolean;
  extraTileClass?: string;
  topRight?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${PART_GRID_TILE_CLASS_BASE} ${extraTileClass} relative block text-inherit no-underline`}
      title={titleAttr}
    >
      {topRight}
      {isPrinted ? (
        <span className="pointer-events-none absolute left-1 right-1 top-1 z-[1] truncate text-[9px] font-medium leading-none text-orange-300/95">
          印刷
        </span>
      ) : null}
      <div className="relative mx-auto mt-3 aspect-square w-[calc(100%-0.25rem)] max-w-[4.5rem] overflow-hidden rounded-lg border border-[var(--border)] bg-[rgba(7,10,18,0.72)]">
        {usableImgUrl(thumbUrl) ? (
          <RemoteCoverImage
            src={thumbUrl.trim()}
            fill
            className="object-contain p-0.5"
            sizes="(max-width:640px)20vw,4.5rem"
            alt=""
            fallbackLabel="无图"
            fallbackClassName="text-[9px]"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[9px] text-[var(--muted)]">无图</span>
        )}
      </div>
      <p className="mt-1 truncate px-0.5 text-center font-mono text-[10px] font-semibold leading-tight text-[#b8e632] sm:text-[11px]">
        {partNum}
      </p>
      {children}
    </Link>
  );
}
