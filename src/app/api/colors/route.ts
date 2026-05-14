import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";

import { getCatalogDb } from "@/db/client";
import { colors } from "@/db/schema";

export const dynamic = "force-dynamic";

export type ColorsApiRow = {
  id: number;
  name: string;
  rgb: string;
  isTrans: boolean;
};

export async function GET() {
  const db = getCatalogDb();
  const rows = await db
    .select({
      id: colors.id,
      name: colors.name,
      rgb: colors.rgb,
      isTrans: colors.isTrans,
    })
    .from(colors)
    .orderBy(asc(colors.id));

  const payload: ColorsApiRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    rgb: r.rgb,
    isTrans: r.isTrans,
  }));

  return NextResponse.json({ colors: payload });
}
