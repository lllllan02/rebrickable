import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { mocAttachments } from "@/db/schema";
import { isSafeMocIdForUploadPath, mocUploadAbsoluteDir } from "@/lib/moc-upload-storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ mocId: string; storedFile: string }> };

function asciiFallbackFileName(name: string): string {
  const base = name.replace(/[\r\n"]/g, "_").replace(/[^\x20-\x7E]/g, "_");
  return base.length > 0 ? base : "attachment";
}

export async function GET(_req: Request, ctx: Ctx) {
  const { mocId: rawMoc, storedFile: rawFile } = await ctx.params;
  const mocId = decodeURIComponent(rawMoc);
  const storedFile = decodeURIComponent(rawFile);

  if (!isSafeMocIdForUploadPath(mocId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      mimeType: mocAttachments.mimeType,
      originalName: mocAttachments.originalName,
    })
    .from(mocAttachments)
    .where(and(eq(mocAttachments.mocId, mocId), eq(mocAttachments.storedFile, storedFile)))
    .limit(1);

  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  const abs = path.join(mocUploadAbsoluteDir(mocId), storedFile);
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
