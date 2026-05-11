import { NextResponse } from "next/server";

import { buildPartsSheetXlsxBuffer } from "@/lib/build-parts-sheet-xlsx";
import {
  completeExportJob,
  createExportJob,
  failExportJob,
  markExportJobRow,
  markExportJobWritingFile,
} from "@/lib/export-xlsx-job-store";
import {
  MAX_EXPORT_ROWS,
  parseExportFilenameStem,
  parseExportItems,
  readExportJsonBody,
} from "@/lib/parts-sheet-export-parse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await readExportJsonBody(req);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const rows = parseExportItems(parsed.body);
  if (!rows) {
    return NextResponse.json(
      { error: "缺少字段 items，或其中某行字段类型不正确。" },
      { status: 422 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "items 不能为空数组。" }, { status: 422 });
  }
  if (rows.length > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      { error: `最多导出 ${MAX_EXPORT_ROWS} 行，请分批导出。` },
      { status: 422 }
    );
  }

  const stem = parseExportFilenameStem(parsed.body);
  const jobId = createExportJob(stem, rows.length);

  setImmediate(() => {
    void (async () => {
      try {
        const buf = await buildPartsSheetXlsxBuffer(rows, (p) => {
          if (p.phase === "row") {
            markExportJobRow(jobId, p.doneRows, p.totalRows);
          } else {
            markExportJobWritingFile(jobId);
          }
        });
        completeExportJob(jobId, buf);
      } catch (err) {
        console.error("[parts-sheet/export-xlsx/start]", err);
        failExportJob(jobId, err instanceof Error ? err.message : "build failed");
      }
    })();
  });

  return NextResponse.json({ jobId, total: rows.length });
}
