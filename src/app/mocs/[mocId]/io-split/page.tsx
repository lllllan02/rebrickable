import { and, eq } from "drizzle-orm";
import Link from "next/link";

import { listIoSplitPlanGroupsForMoc } from "@/app/mocs/io-batch-parts-sheet-actions";
import { MocIoSplitWizard } from "@/app/mocs/moc-io-split-wizard";
import { getUserDb } from "@/db/client";
import { buildAttachments } from "@/db/schema";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ mocId: string }>;
  searchParams: Promise<{ attachmentId?: string; done?: string }>;
};

export default async function MocIoSplitPage({ params, searchParams }: Props) {
  const { mocId: raw } = await params;
  const mocId = decodeURIComponent(raw);
  const sp = await searchParams;
  const attachmentId = Number.parseInt(String(sp.attachmentId ?? ""), 10);
  const showList = sp.done === "1";

  const mocHref = buildSubjectDetailPath(BUILD_SUBJECT_MOC, mocId);

  if (!Number.isFinite(attachmentId) || attachmentId < 1) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-200/95">缺少有效的 attachmentId 参数。</p>
        <Link href={mocHref} className="mt-4 inline-block text-sm text-[var(--accent)] underline">
          返回 MOC
        </Link>
      </main>
    );
  }

  const db = getUserDb();
  const attRows = await db
    .select({
      id: buildAttachments.id,
      originalName: buildAttachments.originalName,
      storedFile: buildAttachments.storedFile,
    })
    .from(buildAttachments)
    .where(
      and(
        eq(buildAttachments.id, attachmentId),
        eq(buildAttachments.subjectKind, BUILD_SUBJECT_MOC),
        eq(buildAttachments.subjectId, mocId)
      )
    )
    .limit(1);
  const att = attRows[0];
  if (!att) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-200/95">未找到该 .io 附件。</p>
        <Link href={mocHref} className="mt-4 inline-block text-sm text-[var(--accent)] underline">
          返回 MOC
        </Link>
      </main>
    );
  }

  const label = (att.originalName ?? "").trim() || att.storedFile;
  const splitPlans = showList ? await listIoSplitPlanGroupsForMoc(mocId) : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {showList && splitPlans.length > 0 ? (
        <p className="mb-6 text-sm text-emerald-200/95">
          已保存 {splitPlans.reduce((n, p) => n + p.batches.length, 0)} 个分包零件表。请在{" "}
          <Link href={`${mocHref}#moc-parts-sheet-tools`} className="underline">
            MOC 详情 · 零件表
          </Link>{" "}
          中选择对应方案查看全部零件。
        </p>
      ) : null}

      <MocIoSplitWizard mocId={mocId} attachmentId={attachmentId} attachmentLabel={label} />
    </main>
  );
}
