"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setBuildOwnedAction } from "@/app/build/build-owned-actions";
import type { OwnedSubjectKind } from "@/lib/build-owned-subject";

type Props = {
  subjectKind: OwnedSubjectKind;
  subjectId: string;
  initialOwned: boolean;
  className?: string;
};

export function BuildOwnedToggle({ subjectKind, subjectId, initialOwned, className = "" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [owned, setOwned] = useState(initialOwned);

  useEffect(() => {
    setOwned(initialOwned);
  }, [initialOwned, subjectId, subjectKind]);

  const baseBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg font-semibold leading-none transition-colors disabled:opacity-50";

  return (
    <button
      type="button"
      title={owned ? "点击取消「拥有」" : "点击标记为拥有"}
      aria-label={owned ? "取消拥有" : "标记为拥有"}
      aria-pressed={owned}
      disabled={pending}
      className={`${baseBtn} ${
        owned
          ? "border-[var(--accent)] bg-[var(--accent)] text-[#141414] shadow-sm hover:opacity-90"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
      } ${className}`.trim()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !owned;
        setOwned(next);
        startTransition(async () => {
          const res = await setBuildOwnedAction({ subjectKind, subjectId, owned: next });
          if (!res.ok) {
            setOwned(!next);
            return;
          }
          router.refresh();
        });
      }}
    >
      {owned ? "✓" : "+"}
    </button>
  );
}
