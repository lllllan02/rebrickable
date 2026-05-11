import Link from "next/link";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { mocSavedPartsSheets } from "@/db/schema";
import { parseStoredMocPartsSheet } from "@/lib/parts-sheet-moc-id";

import type { InitialMocSheetFromServer } from "./actions";
import { PartsSheetImport } from "./parts-sheet-import";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ loadMoc?: string | string[] }>;
};

export default async function PartsSheetPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = sp.loadMoc;
  const loadMocId =
    typeof raw === "string"
      ? raw.trim() || undefined
      : Array.isArray(raw)
        ? raw[0]?.trim() || undefined
        : undefined;

  let initialMocSheet: InitialMocSheetFromServer | null = null;
  let initialMocLoadError: string | null = null;

  if (loadMocId) {
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
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">Parts sheet</p>
        <h1 className="page-title">零件表</h1>
        <p className="page-description">
          导入与{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
            rebrickable_parts_*_缺货表.csv
          </code>{" "}
          相同结构的 CSV：按{" "}
          <span className="font-medium text-[var(--text)]">part_num</span>{" "}
          在本地库中精确匹配零件，并尽量按{" "}
          <span className="font-medium text-[var(--text)]">颜色 ID</span>{" "}
          从库存数据中选取缩略图（若无同色图则退化为该零件任意一色图片）。
          编辑后可导出 Excel（前四列与 CSV 一致便于再导入，缩略图与说明列在右侧），或导出 CSV。
          数据来自你本地下载后上传的 CSV；可按 MOC ID 保存到本地 SQLite（服务端动作写库，无独立
          MOC HTTP 接口；同一 ID 可反复覆盖）。文件名含{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
            rebrickable_parts_数字_
          </code>{" "}
          时会尝试自动填入 MOC ID。已存列表见{" "}
          <Link href="/mocs" className="underline">
            MOC 列表
          </Link>
          。
        </p>
      </section>
      <PartsSheetImport
        requestedLoadMocId={loadMocId}
        initialMocSheet={initialMocSheet}
        initialMocLoadError={initialMocLoadError}
      />
    </div>
  );
}
