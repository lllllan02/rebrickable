"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { syncGobricksShortageForSubjectWithModifiedConfirm } from "@/app/mocs/gobricks-shortage-sync-client";
import type { BuildSubjectKind } from "@/lib/build-subject";

const triggerClass =
  "ml-1.5 inline cursor-pointer border-0 bg-transparent p-0 align-baseline font-inherit tabular-nums underline-offset-2 hover:underline disabled:cursor-wait disabled:no-underline disabled:opacity-45";

function formatSyncHint(iso: string | null | undefined): string {
  const t = typeof iso === "string" ? iso.trim() : "";
  if (!t) return "";
  return t.slice(0, 19).replace("T", " ");
}

type Props = {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  totalPartQty: number;
  hasShortage: boolean;
  shortageLineCount: number | null;
  shortageTotalQty: number | null;
  markedNoShortage: boolean;
  gobricksShortageSyncAt: string | null;
};

/** 列表卡片：点击「检查」或「缺 n」触发高砖同步；无缺件时显示绿色「全」并可再次对照 */
export function GobricksShortageListInlineCheck({
  subjectKind,
  subjectId,
  totalPartQty,
  hasShortage,
  shortageLineCount,
  shortageTotalQty,
  markedNoShortage,
  gobricksShortageSyncAt,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const runCheck = useCallback(() => {
    setErrorHint(null);
    startTransition(async () => {
      const r = await syncGobricksShortageForSubjectWithModifiedConfirm({ subjectKind, subjectId });
      if (r.ok) {
        router.refresh();
        return;
      }
      if (!r.cancelled) setErrorHint(r.error);
    });
  }, [router, subjectId, subjectKind]);

  const syncHint = formatSyncHint(gobricksShortageSyncAt);
  const verifiedNoShortageByGobricks = syncHint.length > 0 && !hasShortage;
  const showGreenQuan = markedNoShortage || verifiedNoShortageByGobricks;

  const quanTitle = markedNoShortage
    ? syncHint
      ? `已标记无缺件；高砖上次对照 ${syncHint}。点击再次对照高砖。`
      : "已标记无缺件；点击可再次对照高砖。"
    : syncHint
      ? `高砖上次对照无缺件（${syncHint}）；点击再次检查。`
      : "高砖对照无缺件；点击再次检查。";

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-pretty leading-snug tabular-nums text-[var(--text)]">
        <span className="text-[var(--muted-2)]">零件总数 </span>
        {totalPartQty.toLocaleString("zh-CN")}
        {hasShortage ? (
          <button
            type="button"
            disabled={pending}
            onClick={runCheck}
            className={`${triggerClass} font-medium text-amber-200/95`}
            title={`缺件表 ${(shortageLineCount ?? 0).toLocaleString("zh-CN")} 行，点击更新`}
            aria-busy={pending}
            aria-label="对照高砖更新缺件"
          >
            缺 {(shortageTotalQty ?? 0).toLocaleString("zh-CN")}
          </button>
        ) : showGreenQuan ? (
          <button
            type="button"
            disabled={pending}
            onClick={runCheck}
            className={`${triggerClass} font-semibold text-emerald-400/95`}
            title={quanTitle}
            aria-busy={pending}
            aria-label="对照高砖复查缺件"
          >
            {pending ? "检查中…" : "全"}
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={runCheck}
            className={`${triggerClass} text-[var(--muted-2)]`}
            title="对照高砖检查缺件"
            aria-busy={pending}
            aria-label="对照高砖检查缺件"
          >
            {pending ? "检查中…" : "检查"}
          </button>
        )}
      </p>
      {errorHint ? (
        <p
          className="max-w-full break-words text-left text-[10px] leading-snug text-red-200/90"
          title={errorHint}
        >
          {errorHint}
        </p>
      ) : null}
    </div>
  );
}
