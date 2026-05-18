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

/** 一键下载分包方案下全部零件表（zip） */
export async function downloadIoSplitPlanZip(input: {
  mocId: string;
  groupKey: string;
  displayName: string;
  zipFilename: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`/api/mocs/${encodeURIComponent(input.mocId)}/io-split-plan-export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupKey: input.groupKey,
        displayName: input.displayName,
      }),
    });
  } catch {
    return { ok: false, error: "导出失败，请检查网络后重试。" };
  }

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const msg =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `导出失败（${res.status}）`;
    return { ok: false, error: msg };
  }

  const blob = await res.blob();
  downloadBlob(input.zipFilename.endsWith(".zip") ? input.zipFilename : `${input.zipFilename}.zip`, blob);
  return { ok: true };
}
