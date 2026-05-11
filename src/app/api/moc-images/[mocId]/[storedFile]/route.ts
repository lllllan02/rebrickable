import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { mocImages } from "@/db/schema";
import { mocUploadAbsoluteDir } from "@/lib/moc-upload-storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ mocId: string; storedFile: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { mocId: rawMoc, storedFile: rawFile } = await ctx.params;
  const mocId = decodeURIComponent(rawMoc);
  const storedFile = decodeURIComponent(rawFile);

  const db = getDb();
  const [row] = await db
    .select({
      mimeType: mocImages.mimeType,
    })
    .from(mocImages)
    .where(and(eq(mocImages.mocId, mocId), eq(mocImages.storedFile, storedFile)))
    .limit(1);

  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  const abs = path.join(mocUploadAbsoluteDir(mocId), storedFile);
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
