"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import type { GlobalSearchPayload } from "@/lib/global-search-types";
import { emptyGlobalSearchPayload } from "@/lib/global-search-types";

export function GlobalSearch() {
  const router = useRouter();
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GlobalSearchPayload>(emptyGlobalSearchPayload());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const runSearch = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setData(emptyGlobalSearchPayload());
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
        const json = (await res.json()) as GlobalSearchPayload;
        if (seqRef.current === my) setData(json);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (seqRef.current === my) setData(emptyGlobalSearchPayload());
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
      setData(emptyGlobalSearchPayload());
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
    data.mocs.length +
    data.sets.length +
    data.parts.length +
    data.colors.length +
    data.elements.length;

  return (
    <div ref={wrapRef} className="global-search">
      <form
        role="search"
        action="/search"
        method="get"
        className="global-search-field-wrap"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = q.trim();
          if (!trimmed) return;
          router.push(`/search?q=${encodeURIComponent(trimmed)}`);
          setOpen(false);
        }}
      >
        <label htmlFor={listId} className="sr-only">
          全站搜索
        </label>
        <input
          id={listId}
          name="q"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="MOC、套装、零件、颜色、元素…"
          className="global-search-input field"
          autoComplete="off"
          spellCheck={false}
          aria-controls="global-search-panel"
        />
        {loading ? (
          <span className="global-search-status" aria-live="polite">
            搜索中…
          </span>
        ) : null}
      </form>
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
          {data.mocs.length > 0 ? (
            <section className="global-search-group">
              <h3 className="global-search-group-title">MOC</h3>
              <ul className="global-search-list">
                {data.mocs.map((h) => (
                  <li key={h.href}>
                    <Link
                      href={h.href}
                      className="global-search-hit global-search-hit-row"
                      onClick={() => setOpen(false)}
                    >
                      <div className="global-search-thumb relative">
                        <RemoteCoverImage
                          src={(h.imgUrl ?? "").trim()}
                          fill
                          className="h-full w-full object-contain p-0.5"
                          sizes="40px"
                          alt=""
                          fallbackLabel="M"
                          fallbackClassName="global-search-thumb-fallback"
                        />
                      </div>
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
                      <div className="global-search-thumb relative">
                        <RemoteCoverImage
                          src={(h.imgUrl ?? "").trim()}
                          fill
                          className="h-full w-full object-contain p-0.5"
                          sizes="40px"
                          alt=""
                          fallbackLabel="套"
                          fallbackClassName="global-search-thumb-fallback"
                        />
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
          {!loading && q.trim() ? (
            <div className="global-search-footer">
              <Link
                href={`/search?q=${encodeURIComponent(q.trim())}`}
                onClick={() => setOpen(false)}
              >
                查看全部搜索结果
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
