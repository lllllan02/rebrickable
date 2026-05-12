"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type Props = {
  src: string;
  alt?: string;
  /** 与 Next/Image 一致；卡片封面多为 true */
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  unoptimized?: boolean;
  priority?: boolean;
  /** 加载失败或空 src 时显示 */
  fallbackLabel?: string;
  fallbackClassName?: string;
};

/**
 * 远程 CDN 图（如 Rebrickable）：URL 存在但 404/空体时避免浏览器裂图，回退为统一占位。
 */
export function RemoteCoverImage({
  src,
  alt = "",
  fill,
  width,
  height,
  className,
  sizes,
  unoptimized = true,
  priority,
  fallbackLabel = "无图",
  fallbackClassName = "",
}: Props) {
  const [failed, setFailed] = useState(false);
  const trimmed = src.trim();

  useEffect(() => {
    setFailed(false);
  }, [trimmed]);

  const onError = useCallback(() => {
    setFailed(true);
  }, []);

  const useFill = fill === true;

  if (!trimmed || failed) {
    const base = useFill
      ? "absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]"
      : "flex h-full w-full items-center justify-center text-sm text-[var(--muted)]";
    return (
      <span className={`${base} ${fallbackClassName}`.trim()} role="img" aria-label={fallbackLabel}>
        {fallbackLabel}
      </span>
    );
  }

  if (useFill) {
    return (
      <Image
        src={trimmed}
        alt={alt}
        fill
        className={className}
        sizes={sizes}
        unoptimized={unoptimized}
        priority={priority}
        onError={onError}
      />
    );
  }

  if (width != null && height != null) {
    return (
      <Image
        src={trimmed}
        alt={alt}
        width={width}
        height={height}
        className={className}
        sizes={sizes}
        unoptimized={unoptimized}
        priority={priority}
        onError={onError}
      />
    );
  }

  return (
    <span
      className={`flex h-full w-full items-center justify-center text-sm text-[var(--muted)] ${fallbackClassName}`.trim()}
      role="img"
      aria-label={fallbackLabel}
    >
      {fallbackLabel}
    </span>
  );
}
