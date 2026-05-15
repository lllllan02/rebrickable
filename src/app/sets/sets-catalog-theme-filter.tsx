"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";

const TRIGGER_ID = "sets-catalog-theme-btn";
const LISTBOX_ID = "sets-catalog-theme-listbox";

export type SetsCatalogThemeFilterRow = {
  value: string;
  name: string;
  thumbUrl: string | null;
};

const thumbBox = "relative h-9 w-9 shrink-0 overflow-hidden rounded border border-[var(--border-soft)] bg-[var(--surface-3)]";

function ThemeThumb({ url, label }: { url: string | null; label: string }) {
  if (url != null && url.trim().length > 0) {
    return (
      <div className={thumbBox}>
        <RemoteCoverImage
          src={url.trim()}
          width={36}
          height={36}
          className="object-cover"
          sizes="36px"
          alt=""
          fallbackLabel="无"
        />
      </div>
    );
  }
  return (
    <div
      className={`${thumbBox} flex items-center justify-center text-[10px] font-medium text-[var(--muted)]`}
      aria-hidden
    >
      {label.slice(0, 1)}
    </div>
  );
}

/**
 * 套装目录筛选栏：带缩略图的主题选择（GET 表单内 hidden + requestSubmit，与 AutoSubmitSelect 行为一致）。
 */
export function SetsCatalogThemeFilter({
  name,
  defaultValue,
  themes,
  className,
}: {
  name: string;
  defaultValue: string;
  themes: SetsCatalogThemeFilterRow[];
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const current = themes.find((t) => t.value === defaultValue) ?? themes[0]!;

  const submitTheme = useCallback((value: string) => {
    const input = hiddenRef.current;
    const form = input?.form;
    if (!input || !form) return;
    input.value = value;
    setOpen(false);
    form.requestSubmit();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative min-w-[min(100%,16rem)] max-w-[min(100%,20rem)] ${className ?? ""}`}>
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={defaultValue} />
      <button
        id={TRIGGER_ID}
        type="button"
        className="field flex w-full items-center gap-2.5 py-2 pl-2.5 pr-2 text-left text-sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={LISTBOX_ID}
        onClick={() => setOpen((v) => !v)}
      >
        <ThemeThumb
          url={current.thumbUrl}
          label={current.value === "all" ? "全" : current.name}
        />
        <span className="min-w-0 flex-1 truncate font-medium text-[var(--text)]">{current.name}</span>
        <span className="shrink-0 text-[var(--muted)]" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <ul
          id={LISTBOX_ID}
          role="listbox"
          aria-labelledby={TRIGGER_ID}
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-50 max-h-[min(22rem,calc(100vh-12rem))] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg)] py-1 shadow-lg ring-1 ring-black/10"
        >
          {themes.map((t) => {
            const selected = t.value === defaultValue;
            return (
              <li key={t.value} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center gap-2.5 px-2 py-2 text-left text-sm transition-colors ${
                    selected ? "bg-[var(--accent-soft)] text-[var(--text)]" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                  }`}
                  onClick={() => submitTheme(t.value)}
                >
                  <ThemeThumb url={t.thumbUrl} label={t.value === "all" ? "全" : t.name} />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
