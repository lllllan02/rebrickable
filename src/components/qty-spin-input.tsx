"use client";

type Props = {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
  "aria-label"?: string;
  /** 方格角标用更小样式（不显示箭头） */
  compact?: boolean;
  className?: string;
  onChange: (digits: string) => void;
  onCommit: () => void;
  onStep: (delta: 1 | -1) => void;
  canDecrement?: boolean;
};

function ChevronUpIcon() {
  return (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden>
      <path
        d="M1 4L4 1.2 7 4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden>
      <path
        d="M1 1L4 3.8 7 1"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 数字输入 + 框内上下箭头快捷加减 */
export function QtySpinInput({
  value,
  disabled = false,
  placeholder = "0",
  title,
  "aria-label": ariaLabel,
  compact = false,
  className = "",
  onChange,
  onCommit,
  onStep,
  canDecrement = true,
}: Props) {
  if (compact) {
    return (
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        className={`h-4 w-7 rounded border border-[var(--border)] bg-[rgba(7,10,18,0.9)] px-0.5 text-center text-[9px] font-semibold tabular-nums leading-none text-[var(--text)] shadow-sm outline-none focus:border-[var(--accent)] disabled:opacity-50 ${className}`.trim()}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onStep(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (canDecrement) onStep(-1);
          }
        }}
      />
    );
  }

  return (
    <div
      className={`relative inline-flex h-7 w-[3.15rem] items-stretch overflow-hidden rounded border border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)] ${className}`.trim()}
    >
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        className="h-full min-w-0 flex-1 border-0 bg-transparent py-0 pl-1 pr-3.5 text-center text-[11px] tabular-nums leading-none text-[var(--text)] outline-none disabled:opacity-50"
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onStep(1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (canDecrement) onStep(-1);
          }
        }}
      />
      <div className="absolute inset-y-0 right-0 flex w-3.5 flex-col border-l border-[var(--border)]">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="增加 1"
          title="增加 1"
          className="flex h-1/2 items-center justify-center text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)] disabled:opacity-40"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStep(1);
          }}
        >
          <ChevronUpIcon />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || !canDecrement}
          aria-label="减少 1"
          title="减少 1"
          className="flex h-1/2 items-center justify-center border-t border-[var(--border)] text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--text)] disabled:opacity-40"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStep(-1);
          }}
        >
          <ChevronDownIcon />
        </button>
      </div>
    </div>
  );
}
