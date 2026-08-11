"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  replacePartWithLatestInScopeAction,
  type ReplacePartScope,
} from "@/app/parts/part-upgrade-actions";

type Props = {
  partNum: string;
  /** 升级目标零件号（直接出边）；用于提示 */
  toPartNum: string;
  scope: ReplacePartScope;
  className?: string;
};

/** 零件号左侧 ↑：点击一键替换为升级链路终点 */
export function PartUpgradeReplaceButton({
  partNum,
  toPartNum,
  scope,
  className = "",
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <button
      type="button"
      title={error ?? `有升级替代 → ${toPartNum} · 点击替换为最新`}
      aria-label={`一键替换为最新升级件 ${toPartNum}`}
      disabled={pending}
      className={`text-[10px] font-bold leading-none !text-emerald-400 hover:!text-emerald-300 disabled:opacity-50 ${className}`.trim()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setError(null);
        startTransition(async () => {
          const res = await replacePartWithLatestInScopeAction({
            partNum,
            scope,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "…" : "↑"}
    </button>
  );
}
