import { NextResponse } from "next/server";

import { OWNED_PARTS_BATCH_SIZE, loadOwnedPartCardsFiltered } from "@/lib/load-owned-parts";
import { parseOwnedCategoryParam } from "@/lib/owned-parts-category";
import { serializeOwnedPartCards } from "@/lib/serialize-owned-part-cards";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filter = parseOwnedCategoryParam(searchParams.get("cat") ?? undefined);
  if (filter == null) {
    return NextResponse.json({ error: "无效的分类参数" }, { status: 400 });
  }

  const offset = Math.max(0, Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const requestedLimit = Number.parseInt(
    searchParams.get("limit") ?? String(OWNED_PARTS_BATCH_SIZE),
    10
  );
  const limit = Math.min(
    OWNED_PARTS_BATCH_SIZE,
    Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : OWNED_PARTS_BATCH_SIZE)
  );

  const { rows, totalRows, hasMore } = await loadOwnedPartCardsFiltered(filter, offset, limit);
  const cards = await serializeOwnedPartCards(rows);

  return NextResponse.json({
    cards,
    totalRows,
    hasMore,
    offset,
    nextOffset: offset + cards.length,
  });
}
