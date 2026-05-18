"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { deleteIoSplitPlanGroupAction } from "@/app/mocs/io-batch-parts-sheet-actions";

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M3.25 4.5h9.5M6 4.5V3.25a.75.75 0 01.75-.75h2.5a.75.75 0 01.75.75V4.5M6.25 7.25v4M9.75 7.25v4M4.5 4.5l.65 7.15a.75.75 0 00.75.68h4.2a.75.75 0 00.75-.68l.65-7.15"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  mocId: string;
  groupKey: string;
  planDisplayName: string;
  batchCount: number;
  onDeleted?: () => void;
  /** 与左侧方案标题并排 */
  variant?: "compact" | "default";
};

export function MocIoSplitPlanDeleteButton({
  mocId,
  groupKey,
  planDisplayName,
  batchCount,
  onDeleted,
  variant = "default",
}: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onCancel = useCallback(() => {
    if (pending) return;
    setConfirming(false);
    setError(null);
  }, [pending]);

  const onConfirm = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const r = await deleteIoSplitPlanGroupAction({ mocId, groupKey });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirming(false);
      onDeleted?.();
      router.refresh();
    });
  }, [groupKey, mocId, onDeleted, router]);

  const triggerClass =
    variant === "compact"
      ? "flex shrink-0 items-center justify-center rounded p-1.5 text-red-300/85 hover:bg-red-950/35 hover:text-red-100 disabled:opacity-45"
      : "shrink-0 rounded-md border border-red-400/35 bg-red-950/20 px-2.5 py-1 text-xs font-medium text-red-200/95 hover:bg-red-950/40 disabled:opacity-45";

  const confirmPanel = confirming ? (
    <div
      className={
        variant === "compact"
          ? "rounded-md border border-red-400/30 bg-red-950/25 px-2.5 py-2 text-[11px] text-red-100/95"
          : "w-full min-w-[min(100%,16rem)] max-w-sm rounded-md border border-red-400/30 bg-red-950/25 px-3 py-2.5 text-xs text-red-100/95"
      }
    >
      <p className="font-medium">删除此分包方案？</p>
      <p className="mt-1 leading-relaxed text-red-200/85">
        将永久删除「{planDisplayName}」及其 {batchCount} 个分包，且无法恢复。
      </p>
      {error ? <p className="mt-2 text-[11px] text-red-200/95">{error}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-red-400/40 bg-red-950/50 px-2.5 py-1 text-[11px] hover:bg-red-950/70 disabled:opacity-45"
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "删除中…" : "确认删除"}
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-45"
          disabled={pending}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  ) : null;

  if (variant === "compact") {
    return (
      <div className={confirming ? "col-span-2 w-full min-w-0" : "shrink-0"}>
        {!confirming ? (
          <button
            type="button"
            className={triggerClass}
            disabled={pending}
            aria-label={`删除「${planDisplayName}」`}
            title={`删除「${planDisplayName}」`}
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            <TrashIcon />
          </button>
        ) : (
          confirmPanel
        )}
        {error && !confirming ? (
          <p className="mt-1 text-[10px] leading-snug text-red-200/95">{error}</p>
        ) : null}
      </div>
    );
  }

  if (!confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          className={triggerClass}
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          删除方案
        </button>
        {error ? <p className="max-w-[14rem] text-right text-[11px] text-red-200/95">{error}</p> : null}
      </div>
    );
  }

  return confirmPanel;
}
