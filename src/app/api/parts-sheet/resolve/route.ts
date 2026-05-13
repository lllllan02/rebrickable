import { NextResponse } from "next/server";

import { resolveShortageCsvInDb } from "@/lib/parts-sheet-resolve-csv-db";

export const dynamic = "force-dynamic";

export type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "请求体须为 JSON。" },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("csv" in body) ||
    typeof (body as { csv: unknown }).csv !== "string"
  ) {
    return NextResponse.json(
      { error: "缺少字段 csv（字符串）。" },
      { status: 400 }
    );
  }

  const csv = (body as { csv: string }).csv;
  const resolved = await resolveShortageCsvInDb(csv);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: resolved.error, lineNumber: resolved.lineNumber ?? null },
      { status: 422 }
    );
  }

  return NextResponse.json({
    skippedHeader: resolved.skippedHeader,
    items: resolved.items,
  });
}
