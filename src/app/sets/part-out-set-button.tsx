"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { partOutSetAction } from "@/app/sets/part-out-set-actions";

type Props = {
  setNum: string;
  catalogName: string | null;
  /** 当前拼搭进度是否为「拥有」 */
  isOwned: boolean;
  embedded?: boolean;
};

export function PartOutSetButton({ setNum, catalogName, isOwned, embedded = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const runPartOut = useCallback(() => {
    const title = catalogName?.trim() || setNum;
    const ok = window.confirm(
      `确定对「${title}」（${setNum}）杀肉？\n\n将解除套装「拥有」状态，并把官方库存中的零件写入你的散装拥有清单。此操作不可自动撤销。`
    );
    if (!ok) return;

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const r = await partOutSetAction(setNum);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(
        `已写入 ${r.uniqueParts.toLocaleString("zh-CN")} 种零件、共 ${r.partQty.toLocaleString("zh-CN")} 粒。`
      );
      router.refresh();
    });
  }, [catalogName, router, setNum]);

  if (!isOwned) return null;

  const rootClass = embedded
    ? "flex flex-col gap-2.5 border-t border-[var(--border-soft)] pt-3"
    : "flex flex-col gap-3 border-t border-[var(--border-soft)] pt-4";

  return (
    <div className={rootClass}>
      <p className={embedded ? "text-xs text-[var(--muted)]" : "text-sm leading-relaxed text-[var(--muted)]"}>
        杀肉：解除本套装的「拥有」标记，并将官方库存零件转入
        <Link href="/parts/owned" className="mx-1 text-[var(--accent)] underline underline-offset-2">
          散装拥有
        </Link>
        清单。
      </p>
      <button
        type="button"
        className="w-fit rounded-md border border-orange-500/40 bg-[var(--surface-2)] px-3 py-1.5 text-sm text-orange-200/95 transition-colors hover:bg-orange-500/10 disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={runPartOut}
      >
        {pending ? "处理中…" : "杀肉"}
      </button>
      {success ? <p className="text-sm text-emerald-300/95">{success}</p> : null}
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
