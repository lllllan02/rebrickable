"use client";

import { useState, useTransition } from "react";

import { packUserDataAction } from "@/app/settings/pack-user-data-action";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

type Props = {
  gzRelativePath: string;
  uploadsRelativePath: string;
};

export function PackUserDataPanel({ gzRelativePath, uploadsRelativePath }: Props) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="table-shell space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-[var(--text)]">打包用户数据</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          与命令行 <code className="code-pill">make pack</code> /{" "}
          <code className="code-pill">pnpm db:pack</code> 相同：对用户库做 WAL checkpoint 后写入{" "}
          <code className="code-pill">{gzRelativePath}</code>。上传文件目录{" "}
          <code className="code-pill">{uploadsRelativePath}</code> 需自行随 git 一并提交。
        </p>
        <p className="mt-2 text-xs text-[var(--muted-2)]">
          若打包失败，请先停止 <code className="code-pill">make dev</code> 等占用 SQLite 的进程后重试。
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--accent)]/15 disabled:opacity-50"
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const res = await packUserDataAction();
            if (!res.ok) {
              setError(res.error);
              return;
            }
            const at = res.packedAt.slice(0, 19).replace("T", " ");
            setMessage(
              `已于 ${at} 写入 ${res.gzPath}（压缩后 ${formatBytes(res.gzBytes)}，源库 ${formatBytes(res.dbBytes)}）。可执行 git add / commit / push 同步。`
            );
          });
        }}
      >
        {pending ? "打包中…" : "打包用户库"}
      </button>
      {error ? <p className="text-sm text-red-300/90">{error}</p> : null}
      {message ? <p className="text-sm text-[var(--text)]">{message}</p> : null}
    </div>
  );
}
