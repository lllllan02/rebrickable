"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

import { createMocFromSetAction } from "@/app/mocs/create-moc-from-set-actions";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";

export type DerivedMocLink = {
  mocId: string;
  displayName: string;
};

type Props = {
  setNum: string;
  catalogName: string | null;
  derivedMocs: DerivedMocLink[];
  /** 并入「套装资料」侧栏，无顶部分隔标题 */
  embedded?: boolean;
};

export function CreateMocFromSetButton({ setNum, catalogName, derivedMocs, embedded = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const runCreate = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const r = await createMocFromSetAction(setNum);
      if (r.ok) {
        router.push(buildSubjectDetailPath(BUILD_SUBJECT_MOC, r.mocId));
        return;
      }
      setError(r.error);
    });
  }, [router, setNum]);

  const nextLabel = derivedMocs.length > 0 ? "再改编一个 MOC" : "改编为 MOC";

  const rootClass = embedded
    ? "flex flex-col gap-2.5 border-t border-[var(--border-soft)] pt-3"
    : "flex flex-col gap-3 border-t border-[var(--border-soft)] pt-4";

  return (
    <div className={rootClass}>
      <p className={embedded ? "text-xs text-[var(--muted)]" : "text-sm leading-relaxed text-[var(--muted)]"}>
        {embedded ? (
          <>
            改编为 MOC（<span className="font-mono text-[var(--text)]">{setNum}-001</span> 起）将以官方库存为起点。
          </>
        ) : (
          <>
            以本套装官方库存为起点创建本地 MOC，编号为{" "}
            <span className="font-mono text-[var(--text)]">{setNum}-001</span>、
            <span className="font-mono text-[var(--text)]">-002</span> …
            {catalogName ? <> （{catalogName}）</> : null}。
          </>
        )}
      </p>
      <button
        type="button"
        className="button-primary w-fit text-sm disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={runCreate}
      >
        {pending ? "创建中…" : nextLabel}
      </button>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {derivedMocs.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {derivedMocs.map((m) => {
            const title = m.displayName.trim() || m.mocId;
            const href = buildSubjectDetailPath(BUILD_SUBJECT_MOC, m.mocId);
            return (
              <li key={m.mocId}>
                <Link href={href} className="text-[var(--accent)] underline underline-offset-2">
                  {title}
                </Link>
                <span className="ml-1.5 font-mono text-xs text-[var(--muted)]">{m.mocId}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
