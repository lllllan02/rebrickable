"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { deleteMocAction } from "@/app/build/build-subject-delete-actions";
import { buildSubjectListPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";

type Props = {
  mocId: string;
  displayTitle: string;
};

export function MocDeleteControl({ mocId, displayTitle }: Props) {
  const ui = buildSubjectUi(BUILD_SUBJECT_MOC);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const listHref = buildSubjectListPath(BUILD_SUBJECT_MOC);

  const onCancel = useCallback(() => {
    if (pending) return;
    setConfirming(false);
    setError(null);
  }, [pending]);

  const onConfirmDelete = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const r = await deleteMocAction(mocId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(listHref);
      router.refresh();
    });
  }, [listHref, mocId, router]);

  if (!confirming) {
    return (
      <div className="border-t border-[var(--border-soft)] pt-4">
        <button
          type="button"
          className="text-sm text-[var(--muted)] underline-offset-2 hover:text-red-200/95 hover:underline disabled:opacity-40"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          删除此 {ui.noun}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-red-400/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--text)]">
      <p className="font-medium text-red-100/95">确认删除？</p>
      <p className="mt-1 text-xs leading-relaxed text-red-200/80">
        将永久删除「{displayTitle}」（{mocId}）的零件表、资料、图片、附件与拥有/收藏标记，且无法恢复。
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-red-400/40 bg-red-950/40 px-3 py-1.5 text-xs text-red-100/95 hover:bg-red-950/60 disabled:opacity-40 sm:text-sm"
          disabled={pending}
          onClick={onConfirmDelete}
        >
          {pending ? "删除中…" : "确认删除"}
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40 sm:text-sm"
          disabled={pending}
          onClick={onCancel}
        >
          取消
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-200/95">{error}</p> : null}
    </div>
  );
}
