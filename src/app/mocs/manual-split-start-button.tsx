"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { createManualSplitPlan } from "@/app/mocs/manual-split-actions";
import type { BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectManualSplitPath } from "@/lib/build-subject-paths";

type Props = {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  className?: string;
};

export function ManualSplitStartButton({ subjectKind, subjectId, className }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onClick = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const r = await createManualSplitPlan({ subjectKind, subjectId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push(buildSubjectManualSplitPath(subjectKind, subjectId, r.planId));
    });
  }, [router, subjectId, subjectKind]);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className={
          className ??
          "rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--text)] hover:opacity-90 disabled:opacity-45"
        }
        disabled={pending}
        onClick={onClick}
      >
        {pending ? "创建中…" : "拆分零件表"}
      </button>
      {error ? <span className="text-[11px] text-red-200/95">{error}</span> : null}
    </span>
  );
}
