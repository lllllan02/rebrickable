import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getUserDb } from "@/db/client";
import { buildImages } from "@/db/schema";
import { isBuildSubjectKind, isSafeBuildSubjectId } from "@/lib/build-subject";
import { buildUploadAbsoluteDir } from "@/lib/build-upload-storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; subjectId: string; storedFile: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { kind: rawKind, subjectId: rawId, storedFile: rawFile } = await ctx.params;
  const kind = decodeURIComponent(rawKind);
  const subjectId = decodeURIComponent(rawId);
  const storedFile = decodeURIComponent(rawFile);

  if (!isBuildSubjectKind(kind) || !isSafeBuildSubjectId(kind, subjectId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getUserDb();
  const [row] = await db
    .select({ mimeType: buildImages.mimeType })
    .from(buildImages)
    .where(
      and(
        eq(buildImages.subjectKind, kind),
        eq(buildImages.subjectId, subjectId),
        eq(buildImages.storedFile, storedFile)
      )
    )
    .limit(1);

  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  const abs = path.join(buildUploadAbsoluteDir(kind, subjectId), storedFile);
  try {
    const buf = await fs.readFile(abs);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": row.mimeType,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Missing file", { status: 404 });
  }
}
