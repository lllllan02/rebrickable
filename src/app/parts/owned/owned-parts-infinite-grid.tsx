"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { OwnedPartCardDto } from "@/lib/owned-part-card-dto";

import { OwnedPartCard, ownedPartCardListKey } from "./owned-part-card";

type Props = {
  initialCards: OwnedPartCardDto[];
  categoryQuery: string;
  initialHasMore: boolean;
  totalRows: number;
};

export function OwnedPartsInfiniteGrid({
  initialCards,
  categoryQuery,
  initialHasMore,
  totalRows,
}: Props) {
  const [cards, setCards] = useState(initialCards);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    setCards(initialCards);
    setHasMore(initialHasMore);
    setError(null);
    loadingRef.current = false;
  }, [initialCards, initialHasMore, categoryQuery]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        cat: categoryQuery,
        offset: String(cards.length),
      });
      const res = await fetch(`/api/parts/owned?${params.toString()}`);
      if (!res.ok) throw new Error("加载失败");
      const data = (await res.json()) as {
        cards: OwnedPartCardDto[];
        hasMore: boolean;
      };
      setCards((prev) => {
        const seen = new Set(prev.map(ownedPartCardListKey));
        const next = data.cards.filter((card) => !seen.has(ownedPartCardListKey(card)));
        return next.length > 0 ? [...prev, ...next] : prev;
      });
      setHasMore(data.hasMore);
    } catch {
      setError("加载更多失败，请稍后重试。");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cards.length, categoryQuery, hasMore]);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <>
      <ul className="tiles-grid" role="list">
        {cards.map((card) => (
          <OwnedPartCard key={ownedPartCardListKey(card)} card={card} />
        ))}
      </ul>
      <div ref={sentinelRef} className="h-px" aria-hidden />
      {loading ? (
        <p className="mt-3 text-center text-xs text-[var(--muted)]">正在加载更多…</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-center text-xs text-orange-300/95">
          {error}{" "}
          <button
            type="button"
            className="text-[var(--accent)] underline underline-offset-2"
            onClick={() => void loadMore()}
          >
            重试
          </button>
        </p>
      ) : null}
      {!hasMore && cards.length > 0 ? (
        <p className="mt-3 text-center text-xs tabular-nums text-[var(--muted)]">
          已显示全部 {totalRows.toLocaleString("zh-CN")} 条
        </p>
      ) : null}
    </>
  );
}
