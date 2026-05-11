import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { buildAttachments } from "@/db/schema";
import { isBuildSubjectKind, isSafeBuildSubjectId } from "@/lib/build-subject";
import { buildUploadAbsoluteDir } from "@/lib/build-upload-storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; subjectId: string; storedFile: string }> };

function asciiFallbackFileName(name: string): string {
  const base = name.replace(/[\r\n"]/g, "_").replace(/[^\x20-\x7E]/g, "_");
  return base.length > 0 ? base : "attachment";
}

export async function GET(_req: Request, ctx: Ctx) {
  const { kind: rawKind, subjectId: rawId, storedFile: rawFile } = await ctx.params;
  const kind = decodeURIComponent(rawKind);
  const subjectId = decodeURIComponent(rawId);
  const storedFile = decodeURIComponent(rawFile);

  if (!isBuildSubjectKind(kind) || !isSafeBuildSubjectId(kind, subjectId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      mimeType: buildAttachments.mimeType,
      originalName: buildAttachments.originalName,
    })
    .from(buildAttachments)
    .where(
      and(
        eq(buildAttachments.subjectKind, kind),
        eq(buildAttachments.subjectId, subjectId),
        eq(buildAttachments.storedFile, storedFile)
      )
    )
    .limit(1);

  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  const abs = path.join(buildUploadAbsoluteDir(kind, subjectId), storedFile);
  try {
    const buf = await fs.readFile(abs);
    const downloadName = (row.originalName ?? "").trim();
    const disp =
      downloadName.length > 0
        ? `attachment; filename="${asciiFallbackFileName(downloadName)}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
        : "attachment";
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": row.mimeType,
        "Content-Disposition": disp,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Missing file", { status: 404 });
  }
}
