"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";

import type { ShortageResolveItem } from "@/lib/shortage-resolve-types";

type ResolveResponse = {
  skippedHeader: boolean;
  items: ShortageResolveItem[];
};

export function ShortageImport() {
  const [items, setItems] = useState<ShortageResolveItem[] | null>(null);
  const [skippedHeader, setSkippedHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineNumber, setLineNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const onFile = useCallback(async (file: File | null) => {
    setError(null);
    setLineNumber(null);
    setItems(null);
    setFileName(null);
    if (!file) return;

    setLoading(true);
    setFileName(file.name);
    try {
      const csv = await file.text();
      const res = await fetch("/api/shortage/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const err =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `请求失败（${res.status}）`;
        const ln =
          typeof data === "object" &&
          data !== null &&
          "lineNumber" in data &&
          typeof (data as { lineNumber: unknown }).lineNumber === "number"
            ? (data as { lineNumber: number }).lineNumber
            : null;
        setError(err);
        setLineNumber(ln);
        return;
      }
      const ok = data as ResolveResponse;
      setSkippedHeader(Boolean(ok.skippedHeader));
      setItems(Array.isArray(ok.items) ? ok.items : []);
    } catch {
      setError("读取或上传失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, []);

  const missingParts = items?.filter((i) => !i.partFound).length ?? 0;
  const noImage = items?.filter((i) => i.partFound && !i.imgUrl).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="filter-bar flex-wrap items-center gap-3">
        <label className="button-primary cursor-pointer text-sm">
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={loading}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void onFile(f);
              e.target.value = "";
            }}
          />
          {loading ? "解析中…" : "选择缺件表 CSV"}
        </label>
        {fileName ? (
          <span className="text-xs text-[var(--muted)]">{fileName}</span>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded-[var(--radius-md)] border border-red-400/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--text)]"
          role="alert"
        >
          <p className="font-medium text-red-200/95">{error}</p>
          {lineNumber !== null ? (
            <p className="mt-1 text-xs text-[var(--muted)]">
              出错行号：{lineNumber}
            </p>
          ) : null}
        </div>
      ) : null}

      {items !== null && items.length === 0 && !error ? (
        <p className="text-sm text-[var(--muted)]">
          文件中没有数据行（仅表头或空文件）。
          {skippedHeader ? " 已跳过表头。" : ""}
        </p>
      ) : null}

      {items !== null && items.length > 0 ? (
        <>
          <div className="meta-row text-xs text-[var(--muted)]">
            <span>共 {items.length} 条</span>
            {skippedHeader ? <span>已识别并跳过表头</span> : null}
            {missingParts > 0 ? (
              <span className="text-amber-200/90">
                本地库未收录：{missingParts} 条
              </span>
            ) : null}
            {noImage > 0 ? (
              <span>有收录但无库存图：{noImage} 条</span>
            ) : null}
          </div>
          <ul className="content-grid">
            {items.map((r) => (
              <li key={`${r.lineNumber}-${r.partNum}-${r.colorId}`} className="result-card">
                <div className="media-box media-box-sm">
                  {r.imgUrl ? (
                    <Image
                      src={r.imgUrl}
                      alt=""
                      width={56}
                      height={56}
                      className="box-border h-full w-full object-contain p-0.5"
                      sizes="56px"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-[9px] leading-tight text-[var(--muted)]"
                      title={r.partFound ? "库存中暂无图片" : "零件未收录"}
                    >
                      {r.partFound ? "无图" : "?"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {r.partFound ? (
                      <Link
                        href={`/parts/${encodeURIComponent(r.partNum)}`}
                        className="font-mono text-xs font-semibold text-[var(--accent)] sm:text-[13px]"
                      >
                        {r.partNum}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs font-semibold text-amber-200/90 sm:text-[13px]">
                        {r.partNum}
                      </span>
                    )}
                    <span className="badge" title="CSV 中的颜色 ID">
                      色 {r.colorId}
                      {r.colorName ? ` · ${r.colorName}` : ""}
                    </span>
                    <span className="badge badge-accent">×{r.quantity}</span>
                    {r.imgSource === "part" ? (
                      <span
                        className="text-[10px] text-[var(--muted)]"
                        title="当前颜色无库存图，已使用该零件其他颜色的图片"
                      >
                        图·异色
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--text)]">
                    {r.partFound && r.partName ? (
                      r.partName
                    ) : r.partFound ? (
                      <span className="text-[var(--muted)]">（无名称）</span>
                    ) : (
                      <span className="text-amber-200/85">
                        本地库中无此 part_num，请核对导出或导入数据。
                      </span>
                    )}
                  </p>
                  {r.rest ? (
                    <p className="meta-row mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
                      {r.rest}
                    </p>
                  ) : null}
                  {r.partFound && !r.elementKnown ? (
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      提示：elements 表中无此零件+颜色组合（图片仍可能来自库存抽样）。
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
