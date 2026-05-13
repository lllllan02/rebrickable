"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setBuildFavoriteAction } from "@/app/build/build-favorite-actions";
import type { BuildSubjectKind } from "@/lib/build-subject";

type Props = {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  initialFavorite: boolean;
  className?: string;
};

export function BuildFavoriteToggle({ subjectKind, subjectId, initialFavorite, className = "" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [favorite, setFavorite] = useState(initialFavorite);

  useEffect(() => {
    setFavorite(initialFavorite);
  }, [initialFavorite, subjectId, subjectKind]);

  const baseBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg font-semibold leading-none transition-colors disabled:opacity-50";

  return (
    <button
      type="button"
      title={favorite ? "点击取消收藏" : "点击加入收藏"}
      aria-label={favorite ? "取消收藏" : "加入收藏"}
      aria-pressed={favorite}
      disabled={pending}
      className={`${baseBtn} ${
        favorite
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/25 hover:bg-[var(--accent)]/20"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
      } ${className}`.trim()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !favorite;
        setFavorite(next);
        startTransition(async () => {
          const res = await setBuildFavoriteAction({ subjectKind, subjectId, favorite: next });
          if (!res.ok) {
            setFavorite(!next);
            return;
          }
          router.refresh();
        });
      }}
    >
      {favorite ? "★" : "☆"}
    </button>
  );
}
