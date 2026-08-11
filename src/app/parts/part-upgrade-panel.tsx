"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  clearPartUpgradeAction,
  lookupPartForUpgradeAction,
  setPartUpgradeAction,
  type PartUpgradeLookupPreview,
} from "@/app/parts/part-upgrade-actions";
import { RemoteCoverImage } from "@/components/remote-cover-image";

export type PartUpgradePanelProps = {
  partNum: string;
  outbound: {
    toPartNum: string;
    name: string;
    thumbUrl: string | null;
  } | null;
  inbound: Array<{
    fromPartNum: string;
    name: string;
    thumbUrl: string | null;
  }>;
  latestPartNum: string;
};

/** 详情页零件号后的紧凑升级标识；设定/更改在弹框中搜索 */
export function PartUpgradePanel({
  partNum,
  outbound,
  inbound,
  latestPartNum,
}: PartUpgradePanelProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<PartUpgradeLookupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupPending, startLookup] = useTransition();
  const [savePending, startSave] = useTransition();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      queueMicrotask(() => inputRef.current?.focus());
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  const resetSearch = () => {
    setQuery("");
    setPreview(null);
    setError(null);
  };

  const openDialog = () => {
    resetSearch();
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    resetSearch();
  };

  const onLookup = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setError("请输入零件号或 element_id。");
      setPreview(null);
      return;
    }
    setError(null);
    startLookup(async () => {
      const res = await lookupPartForUpgradeAction({ query: q });
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setPreview(res.part);
      setError(null);
    });
  };

  const onConfirmSet = () => {
    if (!preview) return;
    startSave(async () => {
      const res = await setPartUpgradeAction({
        fromPartNum: partNum,
        toPartNum: preview.partNum,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeDialog();
      router.refresh();
    });
  };

  const onClear = () => {
    startSave(async () => {
      const res = await clearPartUpgradeAction({ fromPartNum: partNum });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  };

  const busy = lookupPending || savePending;
  const inboundCount = inbound.length;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const dialog = (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-[200] m-0 hidden w-[min(96vw,24rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/70 open:flex"
      aria-labelledby={dialogTitleId}
      onClose={closeDialog}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
        <div className="min-w-0">
          <h3 id={dialogTitleId} className="text-base font-semibold">
            {outbound ? "更改升级目标" : "设定升级目标"}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            本件 <span className="font-mono text-[var(--text)]">{partNum}</span>
            {" · "}
            输入升级后的零件号或 element_id
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
          onClick={closeDialog}
          aria-label="关闭"
        >
          关闭
        </button>
      </div>

      <div className="space-y-3 px-4 py-3">
        <form onSubmit={onLookup} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="part-upgrade-q">
            升级目标零件编号
          </label>
          <input
            ref={inputRef}
            id="part-upgrade-q"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (preview || error) {
                setPreview(null);
                setError(null);
              }
            }}
            placeholder="零件号 / element…"
            className="field min-w-0 flex-1 font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
          <button
            type="submit"
            className="button-primary text-xs"
            disabled={busy || !query.trim()}
          >
            {lookupPending ? "查找中…" : "查找"}
          </button>
        </form>

        {error ? (
          <p className="text-xs text-[var(--danger)]" role="alert">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-[var(--border)] bg-[var(--surface-3)]">
              {preview.thumbUrl ? (
                <RemoteCoverImage
                  src={preview.thumbUrl}
                  width={56}
                  height={56}
                  className="h-full w-full object-contain p-1"
                  alt=""
                  fallbackLabel="无图"
                  fallbackClassName="text-[9px]"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[9px] text-[var(--muted)]">
                  无图
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-semibold text-[var(--accent)]">
                {preview.partNum}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-[var(--text)]">
                {preview.name}
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                {preview.catName ?? "未分类"}
              </p>
            </div>
            <button
              type="button"
              className="button-primary shrink-0 text-xs"
              disabled={busy || preview.partNum === partNum}
              onClick={onConfirmSet}
            >
              {savePending ? "保存中…" : "设为升级件"}
            </button>
          </div>
        ) : null}
      </div>
    </dialog>
  );

  return (
    <>
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-xs font-normal tracking-normal">
        {outbound ? (
          <>
            <span className="min-w-0">
              <span className="text-[var(--muted)]">→</span>
              <Link
                href={`/parts/${encodeURIComponent(outbound.toPartNum)}`}
                className="ml-0.5 font-mono font-semibold !text-sky-400 underline-offset-2 hover:!text-sky-300 hover:underline"
                title={outbound.name}
              >
                {outbound.toPartNum}
              </Link>
              {latestPartNum !== outbound.toPartNum ? (
                <span className="ml-1 text-[var(--muted)]">
                  （终点{" "}
                  <Link
                    href={`/parts/${encodeURIComponent(latestPartNum)}`}
                    className="font-mono font-semibold !text-sky-400 underline-offset-2 hover:!text-sky-300 hover:underline"
                  >
                    {latestPartNum}
                  </Link>
                  ）
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="shrink-0 text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={openDialog}
            >
              更改
            </button>
            <button
              type="button"
              className="shrink-0 text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={onClear}
            >
              {savePending ? "清除中…" : "清除"}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="shrink-0 rounded border border-sky-400/50 bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
            disabled={busy}
            onClick={openDialog}
          >
            升级
          </button>
        )}
        {!outbound && inboundCount > 0 ? (
          <span className="text-[10px] text-[var(--muted)]">
            {inboundCount} 个升级到本件
          </span>
        ) : null}
      </span>
      {mounted ? createPortal(dialog, document.body) : null}
    </>
  );
}
