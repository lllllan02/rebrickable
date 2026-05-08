import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  colors,
  inventories,
  inventoryParts,
  parts,
} from "@/db/schema";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ setNum: string }> };

export default async function SetDetailPage({ params }: Props) {
  const { setNum: raw } = await params;
  const setNum = decodeURIComponent(raw);

  const db = getDb();
  const [inv] = await db
    .select({
      id: inventories.id,
      version: inventories.version,
    })
    .from(inventories)
    .where(eq(inventories.setNum, setNum))
    .orderBy(desc(inventories.version))
    .limit(1);

  if (!inv) notFound();

  const lines = await db
    .select({
      partNum: inventoryParts.partNum,
      name: parts.name,
      colorId: inventoryParts.colorId,
      colorName: colors.name,
      rgb: colors.rgb,
      quantity: inventoryParts.quantity,
      isSpare: inventoryParts.isSpare,
      imgUrl: inventoryParts.imgUrl,
    })
    .from(inventoryParts)
    .innerJoin(parts, eq(inventoryParts.partNum, parts.partNum))
    .innerJoin(colors, eq(inventoryParts.colorId, colors.id))
    .where(eq(inventoryParts.inventoryId, inv.id))
    .orderBy(asc(inventoryParts.partNum), asc(inventoryParts.colorId));

  const sumQty = lines.reduce((a, l) => a + (l.isSpare ? 0 : l.quantity), 0);
  const spareQty = lines.reduce((a, l) => a + (l.isSpare ? l.quantity : 0), 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted)]">
        <Link href="/sets" className="no-underline">
          ← 套装列表
        </Link>
      </p>
      <div>
        <h1 className="font-mono text-2xl font-semibold text-[var(--accent)]">
          {setNum}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          使用库存版本 <strong className="text-[var(--text)]">{inv.version}</strong>
          （inventory_id {inv.id}）。主件共{" "}
          <strong className="text-[var(--text)]">
            {sumQty.toLocaleString("zh-CN")}
          </strong>{" "}
          粒，备用件{" "}
          <strong className="text-[var(--text)]">
            {spareQty.toLocaleString("zh-CN")}
          </strong>{" "}
          粒。
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-2 py-2">零件</th>
              <th className="px-2 py-2">名称</th>
              <th className="px-2 py-2">颜色</th>
              <th className="px-2 py-2 text-right">数量</th>
              <th className="px-2 py-2">备用</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {lines.map((l, i) => (
              <tr key={`${l.partNum}-${l.colorId}-${l.isSpare}-${i}`}>
                <td className="px-2 py-1.5 font-mono">
                  <Link
                    href={`/parts/${encodeURIComponent(l.partNum)}`}
                    className="text-[var(--accent)] no-underline"
                  >
                    {l.partNum}
                  </Link>
                </td>
                <td className="max-w-[280px] truncate px-2 py-1.5 text-[var(--muted)]">
                  {l.name}
                </td>
                <td className="px-2 py-1.5">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded border border-[var(--border)]"
                      style={{ background: `#${l.rgb}` }}
                    />
                    <span>{l.colorName}</span>
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {l.quantity}
                </td>
                <td className="px-2 py-1.5 text-[var(--muted)]">
                  {l.isSpare ? "是" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
