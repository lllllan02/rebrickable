"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type PartHit = {
  type: "part";
  title: string;
  subtitle: string;
  href: string;
};

type SetHit = {
  type: "set";
  title: string;
  subtitle: string;
  href: string;
  imgUrl: string | null;
};

type ColorHit = {
  type: "color";
  title: string;
  subtitle: string;
  href: string;
  rgb: string;
};

type ElementHit = {
  type: "element";
  title: string;
  subtitle: string;
  href: string;
};

type SearchPayload = {
  parts: PartHit[];
  sets: SetHit[];
  colors: ColorHit[];
  elements: ElementHit[];
};

const emptyPayload: SearchPayload = {
  parts: [],
  sets: [],
  colors: [],
  elements: [],
};

function usableImg(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

export function GlobalSearch() {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchPayload>(emptyPayload);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const runSearch = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setData(emptyPayload);
      setLoading(false);
      return;
    }
    const my = ++seqRef.current;
    setLoading(true);
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: ac.signal }
        );
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as SearchPayload;
        if (seqRef.current === my) setData(json);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (seqRef.current === my) setData(emptyPayload);
      } finally {
        if (seqRef.current === my) setLoading(false);
      }
    }, 220);
    debounceRef.current = t;
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      seqRef.current += 1;
      setData(emptyPayload);
      setLoading(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    const cleanup = runSearch(q);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      cleanup?.();
    };
  }, [q, runSearch]);

  useEffect(() => {
    function onDocPointerDown(ev: MouseEvent) {
      const el = wrapRef.current;
      if (!el || !open) return;
      if (ev.target instanceof Node && !el.contains(ev.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, [open]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    if (!open) return;
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const total =
    data.parts.length +
    data.sets.length +
    data.colors.length +
    data.elements.length;

  return (
    <div ref={wrapRef} className="global-search">
      <div className="global-search-field-wrap">
        <label htmlFor={listId} className="sr-only">
          全站搜索
        </label>
        <input
          id={listId}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="零件、套装、颜色、元素…"
          className="global-search-input field"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={open}
          aria-controls="global-search-panel"
        />
        {loading ? (
          <span className="global-search-status" aria-live="polite">
            搜索中…
          </span>
        ) : null}
      </div>
      {open && q.trim() ? (
        <div
          id="global-search-panel"
          className="global-search-panel"
          role="listbox"
          aria-label="搜索结果"
        >
          {total === 0 && !loading ? (
            <p className="global-search-empty">无匹配结果</p>
          ) : null}
          {data.parts.length > 0 ? (
            <section className="global-search-group">
              <h3 className="global-search-group-title">零件</h3>
              <ul className="global-search-list">
                {data.parts.map((h) => (
                  <li key={h.href}>
                    <Link
                      href={h.href}
                      className="global-search-hit"
                      onClick={() => setOpen(false)}
                    >
                      <span className="global-search-hit-title font-mono">
                        {h.title}
                      </span>
                      <span className="global-search-hit-sub">{h.subtitle}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.sets.length > 0 ? (
            <section className="global-search-group">
              <h3 className="global-search-group-title">套装</h3>
              <ul className="global-search-list">
                {data.sets.map((h) => (
                  <li key={h.href}>
                    <Link
                      href={h.href}
                      className="global-search-hit global-search-hit-row"
                      onClick={() => setOpen(false)}
                    >
                      <div className="global-search-thumb">
                        {usableImg(h.imgUrl) ? (
                          <Image
                            src={h.imgUrl.trim()}
                            alt=""
                            width={40}
                            height={40}
                            className="h-full w-full object-contain p-0.5"
                            sizes="40px"
                          />
                        ) : (
                          <span className="global-search-thumb-fallback">套</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="global-search-hit-title font-mono">
                          {h.title}
                        </span>
                        <span className="global-search-hit-sub">{h.subtitle}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.colors.length > 0 ? (
            <section className="global-search-group">
              <h3 className="global-search-group-title">颜色</h3>
              <ul className="global-search-list">
                {data.colors.map((h) => (
                  <li key={h.href}>
                    <Link
                      href={h.href}
                      className="global-search-hit global-search-hit-row"
                      onClick={() => setOpen(false)}
                    >
                      <span
                        className="global-search-color-dot"
                        style={{ background: `#${h.rgb}` }}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="global-search-hit-title">{h.title}</span>
                        <span className="global-search-hit-sub">{h.subtitle}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {data.elements.length > 0 ? (
            <section className="global-search-group">
              <h3 className="global-search-group-title">元素</h3>
              <ul className="global-search-list">
                {data.elements.map((h) => (
                  <li key={h.href}>
                    <Link
                      href={h.href}
                      className="global-search-hit"
                      onClick={() => setOpen(false)}
                    >
                      <span className="global-search-hit-title font-mono">
                        {h.title}
                      </span>
                      <span className="global-search-hit-sub">{h.subtitle}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
