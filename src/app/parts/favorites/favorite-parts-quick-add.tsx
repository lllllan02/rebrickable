"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import {
  lookupPartForFavoriteAction,
  setPartFavoriteAction,
  type PartFavoriteLookupPreview,
} from "@/app/parts/part-favorite-actions";
import { RemoteCoverImage } from "@/components/remote-cover-image";

export function FavoritePartsQuickAdd() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<PartFavoriteLookupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupPending, startLookup] = useTransition();
  const [addPending, startAdd] = useTransition();

  const resetPreview = () => {
    setPreview(null);
    setError(null);
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
      const res = await lookupPartForFavoriteAction({ query: q });
      if (!res.ok) {
        setPreview(null);
        setError(res.error);
        return;
      }
      setPreview(res.part);
      setError(null);
    });
  };

  const onConfirmAdd = () => {
    if (!preview) return;
    startAdd(async () => {
      const res = await setPartFavoriteAction({
        partNum: preview.partNum,
        favorite: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setQuery("");
      setPreview(null);
      setError(null);
      router.refresh();
    });
  };

  const busy = lookupPending || addPending;

  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-labelledby="favorite-quick-add-heading"
    >
      <h2
        id="favorite-quick-add-heading"
        className="text-xs font-semibold text-[var(--text)]"
      >
        添加
      </h2>
      <form onSubmit={onLookup} className="mt-2 flex flex-col gap-2">
        <label className="sr-only" htmlFor="favorite-quick-add-q">
          零件编号
        </label>
        <input
          id="favorite-quick-add-q"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (preview || error) resetPreview();
          }}
          placeholder="零件号 / element…"
          className="field w-full font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <button
          type="submit"
          className="button-primary w-full text-xs"
          disabled={busy || !query.trim()}
        >
          {lookupPending ? "查找中…" : "查找"}
        </button>
      </form>

      {error ? (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
          <div className="mx-auto aspect-square w-16 overflow-hidden rounded border border-[var(--border)] bg-[var(--surface-3)]">
            {preview.thumbUrl ? (
              <RemoteCoverImage
                src={preview.thumbUrl}
                width={64}
                height={64}
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
          <div className="min-w-0 text-center">
            <p className="truncate font-mono text-xs font-semibold text-[var(--accent)]">
              <Link
                href={`/parts/${encodeURIComponent(preview.partNum)}`}
                className="underline-offset-2 hover:underline"
              >
                {preview.partNum}
              </Link>
            </p>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--text)]">
              {preview.name}
            </p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              {preview.catName ?? "未分类"}
              {preview.alreadyFavorite ? " · 已收藏" : null}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="button-primary w-full text-xs"
              disabled={busy || preview.alreadyFavorite}
              onClick={onConfirmAdd}
            >
              {preview.alreadyFavorite
                ? "已收藏"
                : addPending
                  ? "添加中…"
                  : "确认添加"}
            </button>
            <button
              type="button"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-3)]"
              disabled={busy}
              onClick={resetPreview}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
