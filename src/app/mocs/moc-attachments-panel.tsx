"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { deleteMocAttachmentAction, uploadMocAttachmentAction } from "@/app/mocs/moc-attachment-actions";

export type MocAttachmentRow = {
  id: number;
  url: string;
  originalName: string | null;
  byteSize: number;
  createdAt: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10_485_760 ? 1 : 0)} MB`;
}

type Props = {
  mocId: string;
  attachments: MocAttachmentRow[];
};

export function MocAttachmentsPanel({ mocId, attachments }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const uploadFile = useCallback(
    (file: File | null) => {
      if (!file || file.size === 0) return;
      setMessage(null);
      setError(null);
      startTransition(async () => {
        const fd = new FormData();
        fd.set("subjectKind", "moc");
        fd.set("subjectId", mocId);
        fd.set("file", file);
        const r = await uploadMocAttachmentAction(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setMessage("已上传附件。");
        router.refresh();
      });
    },
    [mocId, router]
  );

  const onDelete = useCallback(
    (id: number) => {
      setMessage(null);
      setError(null);
      startTransition(async () => {
        const r = await deleteMocAttachmentAction(mocId, id);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setMessage("已删除附件。");
        router.refresh();
      });
    },
    [mocId, router]
  );

  return (
    <div className="border-t border-[var(--border-soft)] pt-4">
      <h3 className="text-sm font-medium text-[var(--text)]">附件</h3>

      <div className="mt-2">
        <label className="inline-flex cursor-pointer items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text)] hover:border-[var(--accent)]/50 sm:text-sm">
          <input
            type="file"
            accept=".pdf,.io,application/pdf"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void uploadFile(f);
              e.target.value = "";
            }}
          />
          {pending ? "处理中…" : "上传附件"}
        </label>
      </div>

      {attachments.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {attachments.map((a) => {
            const label = (a.originalName ?? "").trim() || `附件 #${a.id}`;
            return (
              <li
                key={a.id}
                className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/60 px-3 py-2.5 text-xs sm:text-sm"
              >
                <p className="min-w-0 break-all font-medium leading-snug text-[var(--text)]">{label}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <span className="tabular-nums text-[var(--muted)]">{formatBytes(a.byteSize)}</span>
                  <span className="flex shrink-0 gap-3">
                    <a href={a.url} className="text-[var(--accent)] underline underline-offset-2" download>
                      下载
                    </a>
                    <button
                      type="button"
                      disabled={pending}
                      className="text-[var(--muted)] underline-offset-2 hover:text-red-200/95 hover:underline disabled:opacity-40"
                      onClick={() => onDelete(a.id)}
                    >
                      删除
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {message ? (
        <p className="mt-2 text-xs text-emerald-200/95" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-200/95" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
