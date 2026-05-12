import { NextResponse } from "next/server";

import { runGlobalSearch } from "@/lib/global-search-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const data = await runGlobalSearch({ qRaw: q, variant: "dropdown" });
  return NextResponse.json(data);
}
