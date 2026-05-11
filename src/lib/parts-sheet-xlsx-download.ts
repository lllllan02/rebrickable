import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const POLL_MS = 250;
const MAX_WAIT_MS = 10 * 60 * 1000;

export type XlsxExportProgress = { current: number; total: number; writingFile: boolean };

/**
 * 调用本项目的 export-xlsx API，轮询直至完成并触发浏览器下载。
 */
export async function downloadPartsSheetXlsx(
  items: ShortageResolveItem[],
  filenameStem: string,
  onProgress: (p: XlsxExportProgress) => void
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload = { filenameStem, items };

  let res: Response;
  try {
    res = await fetch("/api/parts-sheet/export-xlsx/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: "导出 Excel 失败，请重试。" };
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    let msg =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `导出失败（${res.status}）`;
    const detail =
      typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as { detail: unknown }).detail === "string"
        ? (data as { detail: string }).detail.trim()
        : "";
    if (detail) msg = `${msg}（${detail}）`;
    return { ok: false, error: msg };
  }

  const jobId =
    typeof data === "object" &&
    data !== null &&
    "jobId" in data &&
    typeof (data as { jobId: unknown }).jobId === "string"
      ? (data as { jobId: string }).jobId
      : null;
  const totalFromApi =
    typeof data === "object" &&
    data !== null &&
    "total" in data &&
    typeof (data as { total: unknown }).total === "number"
      ? (data as { total: number }).total
      : items.length;

  if (!jobId) {
    return { ok: false, error: "导出任务创建失败。" };
  }

  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));

    let sr: Response;
    try {
      sr = await fetch(`/api/parts-sheet/export-xlsx/status?jobId=${encodeURIComponent(jobId)}`);
    } catch {
      return { ok: false, error: "导出过程中断，请重试。" };
    }

    const st: unknown = await sr.json().catch(() => null);
    if (!sr.ok) continue;

    const status =
      typeof st === "object" &&
      st !== null &&
      "status" in st &&
      typeof (st as { status: unknown }).status === "string"
        ? (st as { status: string }).status
        : "";
    const current =
      typeof st === "object" &&
      st !== null &&
      "current" in st &&
      typeof (st as { current: unknown }).current === "number"
        ? (st as { current: number }).current
        : 0;
    const total =
      typeof st === "object" &&
      st !== null &&
      "total" in st &&
      typeof (st as { total: unknown }).total === "number"
        ? (st as { total: number }).total
        : totalFromApi;
    const writingFile =
      typeof st === "object" &&
      st !== null &&
      "writingFile" in st &&
      typeof (st as { writingFile: unknown }).writingFile === "boolean"
        ? (st as { writingFile: boolean }).writingFile
        : false;

    if (status === "running") {
      onProgress({ current, total, writingFile });
      continue;
    }

    if (status === "error") {
      const errMsg =
        typeof st === "object" &&
        st !== null &&
        "error" in st &&
        typeof (st as { error: unknown }).error === "string"
          ? (st as { error: string }).error
          : "生成 Excel 失败。";
      return { ok: false, error: errMsg };
    }

    if (status === "done") {
      let dr: Response;
      try {
        dr = await fetch(`/api/parts-sheet/export-xlsx/download?jobId=${encodeURIComponent(jobId)}`);
      } catch {
        return { ok: false, error: "下载过程中断，请重试。" };
      }
      if (!dr.ok) {
        const errBody: unknown = await dr.json().catch(() => null);
        const errMsg =
          typeof errBody === "object" &&
          errBody !== null &&
          "error" in errBody &&
          typeof (errBody as { error: unknown }).error === "string"
            ? (errBody as { error: string }).error
            : `下载失败（${dr.status}）`;
        return { ok: false, error: errMsg };
      }
      const blob = await dr.blob();
      downloadBlob(`${filenameStem}.xlsx`, blob);
      return { ok: true };
    }
  }

  return { ok: false, error: "导出超时，请减少行数或稍后重试。" };
}
