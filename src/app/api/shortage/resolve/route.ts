import { NextResponse } from "next/server";
import { and, inArray, isNotNull, min, ne } from "drizzle-orm";

import { getDb } from "@/db/client";
import { parseShortageCsv } from "@/lib/parse-shortage-csv";
import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";
import { colors, elements, inventoryParts, parts } from "@/db/schema";

export const dynamic = "force-dynamic";

export type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

const MAX_CSV_CHARS = 512_000;

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
  if (csv.length > MAX_CSV_CHARS) {
    return NextResponse.json(
      { error: `CSV 过长（上限 ${MAX_CSV_CHARS} 字符）。` },
      { status: 400 }
    );
  }

  const parsed = parseShortageCsv(csv);
  if (!parsed.ok) {
    return NextResponse.json(
      {
        error: parsed.error,
        lineNumber: parsed.lineNumber ?? null,
      },
      { status: 422 }
    );
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json({
      skippedHeader: parsed.skippedHeader,
      items: [] as ShortageResolveItem[],
    });
  }

  const db = getDb();
  const partNums = [...new Set(parsed.rows.map((r) => r.partNum))];
  const colorIds = [...new Set(parsed.rows.map((r) => r.colorId))];

  const [partRows, colorRows, thumbByPartColor, thumbByPart] =
    await Promise.all([
      db
        .select({ partNum: parts.partNum, name: parts.name })
        .from(parts)
        .where(inArray(parts.partNum, partNums)),
      db
        .select({ id: colors.id, name: colors.name })
        .from(colors)
        .where(inArray(colors.id, colorIds)),
      db
        .select({
          partNum: inventoryParts.partNum,
          colorId: inventoryParts.colorId,
          thumb: min(inventoryParts.imgUrl),
        })
        .from(inventoryParts)
        .where(
          and(
            inArray(inventoryParts.partNum, partNums),
            isNotNull(inventoryParts.imgUrl),
            ne(inventoryParts.imgUrl, "")
          )
        )
        .groupBy(inventoryParts.partNum, inventoryParts.colorId),
      db
        .select({
          partNum: inventoryParts.partNum,
          thumb: min(inventoryParts.imgUrl),
        })
        .from(inventoryParts)
        .where(
          and(
            inArray(inventoryParts.partNum, partNums),
            isNotNull(inventoryParts.imgUrl),
            ne(inventoryParts.imgUrl, "")
          )
        )
        .groupBy(inventoryParts.partNum),
    ]);

  const partNameByNum = new Map(
    partRows.map((r) => [r.partNum, r.name] as const)
  );
  const colorNameById = new Map(
    colorRows.map((r) => [r.id, r.name] as const)
  );
  const thumbPc = new Map<string, string>();
  for (const t of thumbByPartColor) {
    if (t.thumb) thumbPc.set(`${t.partNum}\t${t.colorId}`, t.thumb);
  }
  const thumbP = new Map<string, string>();
  for (const t of thumbByPart) {
    if (t.thumb) thumbP.set(t.partNum, t.thumb);
  }

  const elementKnownSet = new Set<string>();
  if (partNums.length > 0) {
    const elRows = await db
      .select({
        partNum: elements.partNum,
        colorId: elements.colorId,
      })
      .from(elements)
      .where(
        and(
          inArray(elements.partNum, partNums),
          inArray(elements.colorId, colorIds)
        )
      );
    for (const e of elRows) {
      elementKnownSet.add(`${e.partNum}\t${e.colorId}`);
    }
  }

  const items: ShortageResolveItem[] = parsed.rows.map((r) => {
    const partFound = partNameByNum.has(r.partNum);
    const partName = partNameByNum.get(r.partNum) ?? null;
    const colorName = colorNameById.get(r.colorId) ?? null;
    const key = `${r.partNum}\t${r.colorId}`;
    const colorThumb = thumbPc.get(key) ?? null;
    const partThumb = thumbP.get(r.partNum) ?? null;
    let imgUrl: string | null = null;
    let imgSource: "color" | "part" | null = null;
    if (colorThumb) {
      imgUrl = colorThumb;
      imgSource = "color";
    } else if (partThumb) {
      imgUrl = partThumb;
      imgSource = "part";
    }

    return {
      lineNumber: r.lineNumber,
      partNum: r.partNum,
      colorId: r.colorId,
      quantity: r.quantity,
      rest: r.rest,
      partFound,
      partName,
      colorName,
      elementKnown: elementKnownSet.has(key),
      imgUrl,
      imgSource,
    };
  });

  return NextResponse.json({
    skippedHeader: parsed.skippedHeader,
    items,
  });
}
