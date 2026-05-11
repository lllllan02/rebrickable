import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import type { InitialMocSheetFromServer } from "@/app/mocs/moc-parts-sheet-actions";
import { getDb } from "@/db/client";
import { mocSavedPartsSheets } from "@/db/schema";
import { parseStoredMocPartsSheet } from "@/lib/parts-sheet-moc-id";

import { MocImportContent } from "./moc-import-content";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ loadMoc?: string | string[] }>;
};

export default async function MocImportPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = sp.loadMoc;
  const loadMocId =
    typeof raw === "string"
      ? raw.trim() || undefined
      : Array.isArray(raw)
        ? raw[0]?.trim() || undefined
        : undefined;

  if (!loadMocId) {
    redirect("/mocs");
  }

  let initialMocSheet: InitialMocSheetFromServer | null = null;
  let initialMocLoadError: string | null = null;

  try {
    const db = getDb();
    const rows = await db
      .select({ payloadJson: mocSavedPartsSheets.payloadJson })
      .from(mocSavedPartsSheets)
      .where(eq(mocSavedPartsSheets.mocId, loadMocId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      initialMocLoadError = `数据库中未找到 MOC ${loadMocId} 的已存零件表。`;
    } else {
      try {
        const parsed = JSON.parse(row.payloadJson) as unknown;
        const payload = parseStoredMocPartsSheet(parsed);
        if (!payload || payload.items.length === 0) {
          initialMocLoadError = "已存数据无效或为空。";
        } else {
          initialMocSheet = {
            mocId: loadMocId,
            skippedHeader: payload.skippedHeader,
            items: payload.items,
            savedAt: payload.savedAt,
          };
        }
      } catch {
        initialMocLoadError = "已存数据损坏，无法解析。";
      }
    }
  } catch {
    initialMocLoadError = "读取数据库失败。";
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">MOC</p>
        <h1 className="page-title">零件表导入</h1>
        <p className="page-description">
          编辑与{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
            rebrickable_parts_*_缺货表.csv
          </code>{" "}
          相同结构的已存零件表：可更换 CSV、改颜色、导出 Excel 或 CSV。新文件请从{" "}
          <Link href="/mocs" className="underline">
            MOC 列表
          </Link>{" "}
          顶部直接上传导入。当前载入 MOC ID：{" "}
          <span className="font-mono text-[var(--text)]">{loadMocId}</span>。
        </p>
      </section>
      <MocImportContent
        requestedLoadMocId={loadMocId}
        initialMocSheet={initialMocSheet}
        initialMocLoadError={initialMocLoadError}
      />
    </div>
  );
}
