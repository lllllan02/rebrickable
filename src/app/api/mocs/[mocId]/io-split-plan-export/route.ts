import { NextResponse } from "next/server";

import { listIoSplitPlanGroupsForMoc } from "@/app/mocs/io-batch-parts-sheet-actions";
import { collectAndBuildIoSplitPlanZip } from "@/app/mocs/io-split-plan-export-collect";
import { isSafeBuildSubjectId, BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { buildIoSplitPlanZipExportStem } from "@/lib/parts-sheet-export-filename";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  groupKey?: string;
  displayName?: string;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ mocId: string }> }
) {
  const { mocId: rawMocId } = await ctx.params;
  const mocId = rawMocId.trim();
  if (!mocId || !isSafeBuildSubjectId(BUILD_SUBJECT_MOC, mocId)) {
    return NextResponse.json({ error: "MOC ID 无效。" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON。" }, { status: 400 });
  }

  const groupKey = body.groupKey?.trim();
  if (!groupKey) {
    return NextResponse.json({ error: "缺少 groupKey。" }, { status: 422 });
  }

  const displayName = body.displayName?.trim() || "未命名";
  const plans = await listIoSplitPlanGroupsForMoc(mocId);
  const plan = plans.find((p) => p.groupKey === groupKey);
  if (!plan) {
    return NextResponse.json({ error: "未找到该分包方案。" }, { status: 404 });
  }

  const collected = await collectAndBuildIoSplitPlanZip({ mocId, displayName, plan });
  if (!collected.ok) {
    return NextResponse.json({ error: collected.error }, { status: 422 });
  }

  try {
    const zipBuffer = collected.buffer;
    const zipStem = buildIoSplitPlanZipExportStem({
      mocId,
      displayName,
      planLabel: plan.ruleLabel.trim() || "分包方案",
    });
    const filename = `${zipStem}.zip`;
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[io-split-plan-export]", err);
    return NextResponse.json({ error: "打包失败，请稍后重试。" }, { status: 500 });
  }
}
