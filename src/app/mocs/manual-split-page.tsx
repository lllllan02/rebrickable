import Link from "next/link";

import { loadManualSplitPlan } from "@/app/mocs/manual-split-actions";
import { ManualSplitStartButton } from "@/app/mocs/manual-split-start-button";
import { ManualSplitWorkspace } from "@/app/mocs/manual-split-workspace";
import type { BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";

type Props = {
  subjectKind: BuildSubjectKind;
  subjectId: string;
  planIdParam?: string;
};

export async function ManualSplitPageBody({ subjectKind, subjectId, planIdParam }: Props) {
  const detailHref = buildSubjectDetailPath(subjectKind, subjectId);
  const parsed = Number.parseInt(String(planIdParam ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-4">
        <p className="text-sm text-[var(--muted)]">
          将基于完整零件表（套装优先上传表，否则官方清单）创建一套手动分包方案。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <ManualSplitStartButton subjectKind={subjectKind} subjectId={subjectId} />
          <Link href={detailHref} className="text-sm text-[var(--accent)] underline">
            返回详情
          </Link>
        </div>
      </main>
    );
  }

  const loaded = await loadManualSplitPlan(parsed);
  if (!loaded.ok) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-200/95">{loaded.error}</p>
        <Link href={detailHref} className="mt-4 inline-block text-sm text-[var(--accent)] underline">
          返回详情
        </Link>
      </main>
    );
  }

  if (loaded.plan.subjectKind !== subjectKind || loaded.plan.subjectId !== subjectId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-200/95">方案不属于当前套装 / MOC。</p>
        <Link href={detailHref} className="mt-4 inline-block text-sm text-[var(--accent)] underline">
          返回详情
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <ManualSplitWorkspace plan={loaded.plan} />
    </main>
  );
}
