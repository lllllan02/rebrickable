"use client";

import { useCallback, useState, type ReactNode } from "react";

type Props = {
  value: string;
  children: ReactNode;
  className?: string;
  /** 无障碍说明片段，如「零件号」「element_id」 */
  kind?: string;
};

const COPIED_MS = 2000;

export function CopyableId({ value, children, className = "", kind }: Props) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const onClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setFailed(true);
      setCopied(false);
      window.setTimeout(() => setFailed(false), 2000);
    }
  }, [value]);

  const idleTitle = "点击复制到剪贴板";
  const title = copied ? "复制成功" : failed ? "复制失败" : idleTitle;
  const aria =
    (kind ? `${kind} ${value}` : value) + "，点击复制到剪贴板";

  return (
    <span className="relative inline-block max-w-full align-baseline">
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={aria}
        className={
          "inline max-w-full cursor-pointer rounded-sm border-0 bg-transparent px-0.5 py-px -mx-0.5 text-left align-baseline transition-[color,background-color] hover:bg-[rgba(255,255,255,0.07)] active:bg-[rgba(255,255,255,0.11)] " +
          (copied
            ? "text-emerald-300/95 "
            : failed
              ? "text-red-300/90 "
              : "") +
          className
        }
      >
        {children}
      </button>
      {copied ? (
        <span
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-emerald-500/30 bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-emerald-200/95 shadow-md"
        >
          复制成功
        </span>
      ) : null}
      {failed ? (
        <span
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-red-400/30 bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-red-200/95 shadow-md"
        >
          复制失败
        </span>
      ) : null}
    </span>
  );
}
