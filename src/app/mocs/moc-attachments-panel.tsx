"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import {
  deleteBuildAttachmentAction,
  uploadBuildAttachmentAction,
} from "@/app/mocs/moc-attachment-actions";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";

export type MocAttachmentRow = {
  id: number;
  url: string;
  originalName: string | null;
  byteSize: number;
  createdAt: string;
};

function isIoAttachment(name: string | null, url: string): boolean {
  const n = (name ?? "").toLowerCase();
  if (n.endsWith(".io")) return true;
  return url.toLowerCase().includes(".io");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10_485_760 ? 1 : 0)} MB`;
}

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  attachments: MocAttachmentRow[];
};

export function MocAttachmentsPanel({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  attachments,
}: Props) {
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
        fd.set("subjectKind", subjectKind);
        fd.set("subjectId", subjectId);
        fd.set("file", file);
        const r = await uploadBuildAttachmentAction(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setMessage("已上传附件。");
        router.refresh();
      });
    },
    [router, subjectId, subjectKind]
  );

  const onDelete = useCallback(
    (id: number) => {
      setMessage(null);
      setError(null);
      startTransition(async () => {
        const r = await deleteBuildAttachmentAction(subjectKind, subjectId, id);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setMessage("已删除附件。");
        router.refresh();
      });
    },
    [router, subjectId, subjectKind]
  );

  return (
    <div className="flex min-h-0 flex-col border-t border-[var(--border-soft)] pt-3 lg:flex-1">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-[var(--text)]">
          附件
          {attachments.length > 0 ? (
            <span className="ml-1 font-normal text-[var(--muted)]">({attachments.length})</span>
          ) : null}
        </h3>
        <label className="inline-flex shrink-0 cursor-pointer items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text)] hover:border-[var(--accent)]/50">
          <input
            type="file"
            accept=".pdf,.io,.ldr,application/pdf"
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
        <ul className="mt-2 min-h-0 space-y-1.5 overflow-y-auto pr-1 lg:flex-1">
          {attachments.map((a) => {
            const label = (a.originalName ?? "").trim() || `附件 #${a.id}`;
            return (
              <li
                key={a.id}
                className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/60 px-2.5 py-1.5 text-xs"
              >
                <p className="min-w-0 truncate font-medium leading-snug text-[var(--text)]" title={label}>
                  {label}
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="tabular-nums text-[var(--muted)]">{formatBytes(a.byteSize)}</span>
                  <span className="flex shrink-0 flex-wrap gap-2.5">
                    {subjectKind === BUILD_SUBJECT_MOC && isIoAttachment(a.originalName, a.url) ? (
                      <a
                        href={`${buildSubjectDetailPath(BUILD_SUBJECT_MOC, subjectId)}/io-split?attachmentId=${a.id}`}
                        className="text-[var(--accent)] underline underline-offset-2"
                      >
                        分步导出
                      </a>
                    ) : null}
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
