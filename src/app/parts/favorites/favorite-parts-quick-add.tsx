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
    <section className="section-panel" aria-labelledby="favorite-quick-add-heading">
      <h2 id="favorite-quick-add-heading" className="section-title">
        快捷添加
      </h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        输入零件号或 element_id，核对信息后确认加入收藏。
      </p>
      <form onSubmit={onLookup} className="filter-bar mt-3">
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
          placeholder="零件号或 element_id…"
          className="field min-w-[200px] flex-1 font-mono text-sm"
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
        <button
          type="submit"
          className="button-primary text-sm"
          disabled={busy || !query.trim()}
        >
          {lookupPending ? "查找中…" : "查找"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-4 flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="media-box media-box-sm mx-auto shrink-0 sm:mx-0">
            {preview.thumbUrl ? (
              <RemoteCoverImage
                src={preview.thumbUrl}
                width={80}
                height={80}
                className="h-full w-full object-contain p-1.5"
                alt=""
                fallbackLabel="无图"
              />
            ) : (
              <span className="flex h-full min-h-[5rem] w-full items-center justify-center text-xs text-[var(--muted)]">
                无图
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="font-mono text-base font-semibold text-[var(--accent)]">
              <Link
                href={`/parts/${encodeURIComponent(preview.partNum)}`}
                className="underline-offset-2 hover:underline"
              >
                {preview.partNum}
              </Link>
            </p>
            <p className="mt-0.5 text-sm text-[var(--text)]">{preview.name}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {preview.catName ? `分类：${preview.catName}` : "未分类"}
              {preview.matchedElementId
                ? ` · element ${preview.matchedElementId}`
                : null}
              {preview.alreadyFavorite ? " · 已在收藏中" : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-center gap-2 sm:justify-end">
            <button
              type="button"
              className="button-primary text-sm"
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
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] hover:bg-[var(--surface-3)]"
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
