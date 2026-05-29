"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Ref,
} from "react";

import { RemoteCoverImage } from "@/components/remote-cover-image";
import { fetchSetGoodPriceBomPreviewAction } from "@/app/sets/set-good-price-bom-actions";
import { goodPriceBtnSecondary } from "@/lib/set-good-price-buttons";
import {
  groupSetBomPreviewLines,
  type SetBomPreviewGroup,
  type SetBomPreviewGroupMode,
  type SetBomPreviewLine,
} from "@/lib/set-bom-preview-groups";
import { buildSubjectDetailPath } from "@/lib/build-subject-paths";
import { BUILD_SUBJECT_SET } from "@/lib/build-subject";

export type SetGoodPriceBomDialogTarget = {
  setNum: string;
  title: string;
};

type Props = {
  target: SetGoodPriceBomDialogTarget | null;
  onClose: () => void;
};

function usableImgUrl(u: string | null | undefined): u is string {
  return typeof u === "string" && u.trim().length > 0;
}

function BomPartTile({ part }: { part: SetBomPreviewGroup["parts"][number] }) {
  const href = `/parts/${encodeURIComponent(part.partNum)}`;
  const title = [
    `${part.quantity} × ${part.partNum}`,
    part.partName,
    part.colorName,
    part.isSpare ? "备用件" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={href}
      title={title}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/60 transition-colors hover:border-amber-400/40 hover:bg-[var(--surface-2)]"
    >
      <div className="relative aspect-square w-full bg-white/95">
        {usableImgUrl(part.imgUrl) ? (
          <RemoteCoverImage
            src={part.imgUrl.trim()}
            fill
            className="object-contain p-1"
            sizes="72px"
            alt=""
            fallbackLabel="无"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">
            无图
          </span>
        )}
        {part.isSpare ? (
          <span className="absolute right-0.5 top-0.5 rounded bg-[var(--surface)]/90 px-1 py-px text-[9px] text-[var(--muted)]">
            备用
          </span>
        ) : null}
      </div>
      <div className="min-w-0 px-1.5 py-1">
        <p className="truncate font-mono text-[10px] font-medium text-[var(--text)]">{part.partNum}</p>
        {part.colorName ? (
          <p className="truncate text-[9px] text-[var(--muted)]">{part.colorName}</p>
        ) : null}
        <p className="font-mono text-[10px] tabular-nums text-amber-200/90">×{part.quantity}</p>
      </div>
    </Link>
  );
}

function BomGroupThumb({
  thumbUrl,
  colorRgb,
  mode,
}: {
  thumbUrl: string | null;
  colorRgb: string | null;
  mode: SetBomPreviewGroupMode;
}) {
  if (usableImgUrl(thumbUrl)) {
    return (
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-[var(--border-soft)] bg-white/95">
        <RemoteCoverImage
          src={thumbUrl.trim()}
          fill
          className="object-contain p-0.5"
          sizes="40px"
          alt=""
          fallbackLabel="无"
        />
      </span>
    );
  }
  if (mode === "color" && colorRgb) {
    return (
      <span
        className="color-swatch h-10 w-10 shrink-0 rounded-md border border-[var(--border)]"
        style={{ background: `#${colorRgb}` }}
        aria-hidden
      />
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] bg-[var(--surface-3)] text-[10px] text-[var(--muted)]">
      无图
    </span>
  );
}

function bomGroupPanelId(key: string): string {
  return `bom-group-panel-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function BomGroupHeader({
  group,
  mode,
  expanded,
  panelId,
  onToggle,
}: {
  group: SetBomPreviewGroup;
  mode: SetBomPreviewGroupMode;
  expanded: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
        expanded
          ? "bg-[var(--surface-2)] hover:bg-[var(--surface-3)]"
          : "hover:bg-[var(--surface-3)]/50"
      }`}
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={onToggle}
    >
      <BomGroupThumb thumbUrl={group.thumbUrl} colorRgb={group.colorRgb} mode={mode} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text)]">
        {group.label}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
        {group.pieceQty.toLocaleString("zh-CN")} 片
        <span className="text-[var(--muted-2)]"> · {group.lineCount} 行</span>
      </span>
      <span className="shrink-0 text-[var(--muted-2)]" aria-hidden>
        {expanded ? "▾" : "▸"}
      </span>
    </button>
  );
}

function BomGroupPartsPanel({
  group,
  panelId,
}: {
  group: SetBomPreviewGroup;
  panelId: string;
}) {
  return (
    <div id={panelId} className="px-3 pb-3 pt-2">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {group.parts.map((part) => (
          <li key={`${part.partNum}-${part.colorId}-${part.isSpare ? "s" : "m"}`}>
            <BomPartTile part={part} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function BomGroupRow({
  group,
  mode,
  expanded,
  rowRef,
  onToggle,
}: {
  group: SetBomPreviewGroup;
  mode: SetBomPreviewGroupMode;
  expanded: boolean;
  rowRef?: Ref<HTMLLIElement>;
  onToggle: () => void;
}) {
  const panelId = bomGroupPanelId(group.key);

  return (
    <li
      ref={rowRef}
      className={`rounded-md border border-[var(--border-soft)] ${
        expanded ? "bg-[var(--surface-2)]" : "bg-[var(--surface-2)]/30"
      }`}
    >
      {expanded ? (
        <BomGroupHeader
          group={group}
          mode={mode}
          expanded
          panelId={panelId}
          onToggle={onToggle}
        />
      ) : null}
      {expanded ? (
        <BomGroupPartsPanel group={group} panelId={panelId} />
      ) : (
        <BomGroupHeader
          group={group}
          mode={mode}
          expanded={false}
          panelId={panelId}
          onToggle={onToggle}
        />
      )}
    </li>
  );
}

export function SetGoodPriceBomDialog({ target, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<SetBomPreviewLine[] | null>(null);
  const [meta, setMeta] = useState<{
    setNum: string;
    catalogName: string | null;
    totalPieceQty: number;
    sparePieceQty: number;
  } | null>(null);
  const [groupMode, setGroupMode] = useState<SetBomPreviewGroupMode>("category");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const groupRowRefs = useRef(new Map<string, HTMLLIElement>());
  const pendingScrollKeyRef = useRef<string | null>(null);
  const [pinExpandedHeader, setPinExpandedHeader] = useState(false);

  const groups = useMemo(
    () => (lines ? groupSetBomPreviewLines(lines, groupMode) : []),
    [lines, groupMode]
  );

  const expandedKey = expandedKeys.size > 0 ? [...expandedKeys][0] : null;
  const expandedGroup = expandedKey
    ? groups.find((group) => group.key === expandedKey)
    : undefined;

  useEffect(() => {
    setExpandedKeys(new Set());
  }, [groupMode, target?.setNum]);

  useEffect(() => {
    if (!target) {
      dialogRef.current?.close();
      setLines(null);
      setMeta(null);
      setError(null);
      return;
    }

    setError(null);
    setLines(null);
    setMeta(null);
    dialogRef.current?.showModal();

    startTransition(async () => {
      const res = await fetchSetGoodPriceBomPreviewAction({ setNum: target.setNum });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLines(res.lines);
      setMeta({
        setNum: res.setNum,
        catalogName: res.catalogName,
        totalPieceQty: res.totalPieceQty,
        sparePieceQty: res.sparePieceQty,
      });
    });
  }, [target]);

  const closeDialog = () => {
    dialogRef.current?.close();
    onClose();
  };

  const toggleGroup = (key: string) => {
    setExpandedKeys((prev) => {
      if (prev.has(key)) return new Set();

      const prevKey = prev.size > 0 ? [...prev][0] : null;
      const prevIndex = prevKey ? groups.findIndex((group) => group.key === prevKey) : -1;
      const nextIndex = groups.findIndex((group) => group.key === key);
      pendingScrollKeyRef.current = prevIndex >= 0 && nextIndex > prevIndex ? key : null;
      return new Set([key]);
    });
  };

  useLayoutEffect(() => {
    const key = pendingScrollKeyRef.current;
    if (!key || key !== expandedKey) return;

    pendingScrollKeyRef.current = null;

    const root = scrollRef.current;
    const row = groupRowRefs.current.get(key);
    if (!root || !row) return;

    const rootRect = root.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const nextTop = root.scrollTop + rowRect.top - rootRect.top;
    root.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  }, [expandedKey, groups]);

  useEffect(() => {
    if (!expandedKey) {
      setPinExpandedHeader(false);
      return;
    }

    const root = scrollRef.current;
    if (!root) return;

    let raf = 0;
    const updatePin = () => {
      const row = groupRowRefs.current.get(expandedKey);
      if (!row) {
        setPinExpandedHeader(false);
        return;
      }

      const rootTop = root.getBoundingClientRect().top;
      const rowRect = row.getBoundingClientRect();
      setPinExpandedHeader(rowRect.top < rootTop && rowRect.bottom > rootTop + 56);
    };

    updatePin();
    raf = requestAnimationFrame(updatePin);
    root.addEventListener("scroll", updatePin, { passive: true });
    window.addEventListener("resize", updatePin);

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("scroll", updatePin);
      window.removeEventListener("resize", updatePin);
    };
  }, [expandedKey, groups]);

  const displayTitle = meta?.catalogName?.trim() || target?.title || meta?.setNum || "";
  const detailHref =
    meta?.setNum != null ? buildSubjectDetailPath(BUILD_SUBJECT_SET, meta.setNum) : null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed left-1/2 top-1/2 z-[200] m-0 hidden h-[min(92dvh,44rem)] max-h-[min(92dvh,44rem)] min-h-0 w-[min(96vw,42rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden overscroll-contain rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-[var(--shadow)] backdrop:bg-black/70 open:flex"
      aria-labelledby={dialogTitleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog();
      }}
    >
      {target ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-3">
            <div className="min-w-0">
              <h3 id={dialogTitleId} className="text-base font-semibold">
                官方 BOM 零件
              </h3>
              <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text)]">{displayTitle}</p>
              {meta ? (
                <p className="mt-1 text-xs tabular-nums text-[var(--muted)]">
                  <span className="font-mono">{meta.setNum}</span>
                  {" · "}
                  共 {meta.totalPieceQty.toLocaleString("zh-CN")} 片
                  {meta.sparePieceQty > 0
                    ? `（含备用 ${meta.sparePieceQty.toLocaleString("zh-CN")} 片）`
                    : null}
                </p>
              ) : null}
              {detailHref ? (
                <Link
                  href={detailHref}
                  className="mt-1 inline-block text-xs text-[var(--accent)] underline-offset-2 hover:underline"
                  onClick={closeDialog}
                >
                  打开套装详情
                </Link>
              ) : null}
            </div>
            <button
              type="button"
              className={goodPriceBtnSecondary}
              onClick={closeDialog}
              aria-label="关闭"
            >
              关闭
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-soft)] px-4 py-2.5">
            <span className="text-xs text-[var(--muted)]">分组</span>
            <div className="inline-flex rounded-md border border-[var(--border-soft)] p-0.5">
              <button
                type="button"
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  groupMode === "category"
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                onClick={() => setGroupMode("category")}
              >
                零件类型
              </button>
              <button
                type="button"
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  groupMode === "color"
                    ? "bg-[var(--accent-soft)] text-[var(--text)]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                onClick={() => setGroupMode("color")}
              >
                颜色
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {expandedGroup && pinExpandedHeader ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4">
                <div className="pointer-events-auto border-b border-[var(--border-soft)] bg-[var(--surface-2)] shadow-[0_6px_10px_-10px_rgba(0,0,0,0.5)]">
                  <BomGroupHeader
                    group={expandedGroup}
                    mode={groupMode}
                    expanded
                    panelId={bomGroupPanelId(expandedGroup.key)}
                    onToggle={() => toggleGroup(expandedGroup.key)}
                  />
                </div>
              </div>
            ) : null}

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3"
            >
              {pending && !lines ? (
                <p className="py-8 text-center text-sm text-[var(--muted)]">加载零件清单…</p>
              ) : error ? (
                <p className="py-8 text-center text-sm text-red-400">{error}</p>
              ) : groups.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--muted)]">无零件数据。</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {groups.map((group) => {
                    const expanded = expandedKeys.has(group.key);
                    return (
                      <BomGroupRow
                        key={group.key}
                        group={group}
                        mode={groupMode}
                        expanded={expanded}
                        rowRef={(node) => {
                          if (node) groupRowRefs.current.set(group.key, node);
                          else groupRowRefs.current.delete(group.key);
                        }}
                        onToggle={() => toggleGroup(group.key)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
