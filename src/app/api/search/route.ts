import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull, like, or, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { colors, elements, legoSets, parts } from "@/db/schema";
import { colorDomId, elementDomId } from "@/lib/dom-anchors";
import { likeFragment } from "@/lib/search";

export const dynamic = "force-dynamic";

const LIMIT = 8;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = likeFragment(searchParams.get("q") ?? "");
  if (!q) {
    return NextResponse.json({
      parts: [],
      sets: [],
      colors: [],
      elements: [],
    });
  }

  const db = getDb();
  const pattern = `%${q}%`;

  const [partRows, setRows, colorRows, elementRows] = await Promise.all([
    db
      .select({
        partNum: parts.partNum,
        name: parts.name,
      })
      .from(parts)
      .where(or(like(parts.name, pattern), like(parts.partNum, pattern)))
      .orderBy(asc(parts.partNum))
      .limit(LIMIT),
    db
      .select({
        setNum: legoSets.setNum,
        name: legoSets.name,
        imgUrl: legoSets.imgUrl,
      })
      .from(legoSets)
      .where(or(like(legoSets.name, pattern), like(legoSets.setNum, pattern)))
      .orderBy(asc(legoSets.setNum))
      .limit(LIMIT),
    db
      .select({
        id: colors.id,
        name: colors.name,
        rgb: colors.rgb,
      })
      .from(colors)
      .where(
        or(
          like(colors.name, pattern),
          like(sql`cast(${colors.id} as text)`, pattern)
        )
      )
      .orderBy(asc(colors.id))
      .limit(LIMIT),
    db
      .select({
        elementId: elements.elementId,
        partNum: elements.partNum,
        partName: parts.name,
        colorName: colors.name,
        designId: elements.designId,
      })
      .from(elements)
      .innerJoin(parts, eq(elements.partNum, parts.partNum))
      .innerJoin(colors, eq(elements.colorId, colors.id))
      .where(
        or(
          like(elements.elementId, pattern),
          like(elements.partNum, pattern),
          and(isNotNull(elements.designId), like(elements.designId, pattern))
        )
      )
      .orderBy(asc(elements.elementId))
      .limit(LIMIT),
  ]);

  return NextResponse.json({
    parts: partRows.map((r) => ({
      type: "part" as const,
      title: r.partNum,
      subtitle: r.name,
      href: `/parts/${encodeURIComponent(r.partNum)}`,
    })),
    sets: setRows.map((r) => ({
      type: "set" as const,
      title: r.setNum,
      subtitle: r.name,
      href: `/sets/${encodeURIComponent(r.setNum)}`,
      imgUrl: r.imgUrl,
    })),
    colors: colorRows.map((r) => ({
      type: "color" as const,
      title: r.name,
      subtitle: `id ${r.id} · #${r.rgb}`,
      href: `/colors#${colorDomId(r.id)}`,
      rgb: r.rgb,
    })),
    elements: elementRows.map((r) => ({
      type: "element" as const,
      title: r.elementId,
      subtitle: `${r.partNum} · ${r.colorName} · ${r.partName}${
        r.designId ? ` · design ${r.designId}` : ""
      }`,
      href: `/parts/${encodeURIComponent(r.partNum)}#${elementDomId(r.elementId)}`,
    })),
  });
}
