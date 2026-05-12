"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import { deleteBuildImageAction, uploadBuildImageAction } from "@/app/mocs/moc-detail-actions";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { BUILD_SUBJECT_MOC, type BuildSubjectKind } from "@/lib/build-subject";
import { buildSubjectUi } from "@/lib/build-ui";

function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest("[contenteditable='true']")) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function clipboardImageFiles(e: ClipboardEvent): File[] {
  const dt = e.clipboardData;
  if (!dt) return [];
  const out: File[] = [];
  const items = dt.items;
  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind !== "file") continue;
      const f = it.getAsFile();
      if (!f || f.size === 0) continue;
      const mime = (it.type || f.type || "").toLowerCase();
      if (mime.startsWith("image/")) out.push(f);
    }
  }
  if (out.length === 0 && dt.files?.length) {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      if (f.size > 0 && f.type.toLowerCase().startsWith("image/")) out.push(f);
    }
  }
  return out;
}

export type MocGalleryImage = {
  id: number;
  url: string;
  originalName: string | null;
  createdAt: string;
};

/** 轮播首张：官方目录图（不可通过本组件删除） */
export type CatalogLeadCover = {
  url: string;
  alt: string;
  heroIsSetBox: boolean;
};

type CarouselSlide =
  | { kind: "catalog"; url: string; alt: string; heroIsSetBox: boolean }
  | { kind: "upload"; id: number; url: string; originalName: string | null; createdAt: string };

type Props = {
  subjectKind?: BuildSubjectKind;
  subjectId: string;
  images: MocGalleryImage[];
  /** 插在最前；与上传图共用同一轮播，第 1 张即封面 */
  catalogLeadCover?: CatalogLeadCover | null;
  /** `set`：空状态与无障碍说明按套装场景措辞 */
  galleryKind?: "default" | "set";
};

export function MocImageCarousel({
  subjectKind = BUILD_SUBJECT_MOC,
  subjectId,
  images,
  catalogLeadCover = null,
  galleryKind = "default",
}: Props) {
  const ui = buildSubjectUi(subjectKind);
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const regionId = useId();
  const [idx, setIdx] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const slides: CarouselSlide[] = useMemo(() => {
    const uploads: CarouselSlide[] = images.map((im) => ({ kind: "upload" as const, ...im }));
    const c = catalogLeadCover;
    const lead = c?.url?.trim();
    if (lead && c) {
      return [
        {
          kind: "catalog" as const,
          url: lead,
          alt: c.alt,
          heroIsSetBox: c.heroIsSetBox,
        },
        ...uploads,
      ];
    }
    return uploads;
  }, [catalogLeadCover, images]);

  const slideCount = slides.length;

  useEffect(() => {
    if (slideCount === 0) {
      setIdx(0);
      return;
    }
    setIdx((i) => Math.min(i, slideCount - 1));
  }, [slideCount]);

  useEffect(() => {
    thumbRefs.current[idx]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [idx]);

  const uploadImageFiles = useCallback(
    (files: File[]) => {
      const list = files.filter((f) => f.size > 0);
      if (list.length === 0) return;
      setMessage(null);
      setError(null);
      startTransition(async () => {
        for (const file of list) {
          const fd = new FormData();
          fd.set("subjectKind", subjectKind);
          fd.set("subjectId", subjectId);
          fd.set("file", file);
          const r = await uploadBuildImageAction(fd);
          if (!r.ok) {
            setError(r.error);
            return;
          }
        }
        setMessage(list.length === 1 ? "已上传。" : `已上传 ${list.length} 张。`);
        router.refresh();
      });
    },
    [router, subjectId, subjectKind]
  );

  const onPick = useCallback(
    (file: File | null) => {
      if (!file) return;
      uploadImageFiles([file]);
    },
    [uploadImageFiles]
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (pending) return;
      if (isEditablePasteTarget(e.target)) return;
      const files = clipboardImageFiles(e);
      if (files.length === 0) return;
      e.preventDefault();
      uploadImageFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pending, uploadImageFiles]);

  const go = useCallback(
    (delta: number) => {
      if (slideCount === 0) return;
      setIdx((i) => (i + delta + slideCount) % slideCount);
    },
    [slideCount]
  );

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditablePasteTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [go]);

  const onDeleteCurrent = useCallback(() => {
    const cur = slides[idx];
    if (!cur || cur.kind !== "upload") return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const r = await deleteBuildImageAction(subjectKind, subjectId, cur.id);
      if (r.ok) {
        setMessage("已删除。");
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }, [slides, idx, router, subjectId, subjectKind]);

  const current = slides[idx] ?? null;
  const currentIsUpload = current?.kind === "upload";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        ref={wrapRef}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-labelledby={regionId}
        className="relative min-h-[min(52vw,22rem)] outline-none ring-[var(--accent)]/40 focus-visible:ring-2 sm:min-h-[min(40vw,26rem)] lg:min-h-[min(36vw,28rem)]"
      >
        <p id={regionId} className="sr-only">
          {galleryKind === "set"
            ? `${ui.noun}图片轮播（首张为封面，含官方目录图与上传参考图），左右方向键切换；本区域聚焦时可使用键盘。`
            : `${ui.noun} 参考图轮播，左右方向键切换；本区域聚焦时可使用键盘。`}
        </p>

        {slideCount === 0 ? (
          <div className="flex min-h-[min(52vw,22rem)] flex-col items-center justify-center gap-4 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-10 text-center sm:min-h-[min(40vw,26rem)] lg:min-h-[min(36vw,28rem)]">
            {galleryKind === "set" ? (
              <p className="max-w-sm text-sm text-[var(--muted)]">
                尚无套装官方图与参考图。支持 JPEG / PNG / WebP / GIF，单张不超过 8 MB；可{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-px font-mono text-[10px]">
                  ⌘V
                </kbd>{" "}
                /{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-px font-mono text-[10px]">
                  Ctrl+V
                </kbd>{" "}
                粘贴截图。导入目录并存在官方盒图或人仔封面（与套装目录相同来源）时，轮播首张即为封面；否则以{" "}
                <strong className="font-medium text-[var(--text)]">上传时间最早</strong> 的一张参考图为首张与列表封面。
              </p>
            ) : (
              <p className="max-w-sm text-sm text-[var(--muted)]">
                尚无参考图。支持 JPEG / PNG / WebP / GIF，单张不超过 8 MB；可{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-px font-mono text-[10px]">
                  ⌘V
                </kbd>{" "}
                /{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface)] px-1 py-px font-mono text-[10px]">
                  Ctrl+V
                </kbd>{" "}
                粘贴截图。列表封面使用上传时间最早的一张。
              </p>
            )}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-3)]">
            <div className="relative aspect-[4/3] w-full max-h-[min(70vh,32rem)] min-h-[14rem]">
              {current ? (
                <RemoteCoverImage
                  key={
                    current.kind === "catalog"
                      ? `cat-${current.url}`
                      : `up-${current.id}`
                  }
                  src={current.url}
                  fill
                  className="object-contain p-2"
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  alt={
                    current.kind === "catalog"
                      ? current.alt
                      : (current.originalName ?? `${ui.noun} 参考图`)
                  }
                  priority={idx === 0}
                  unoptimized={current.kind === "upload"}
                  fallbackLabel={galleryKind === "set" ? "暂无官方图" : "无图"}
                />
              ) : null}
            </div>
            {slideCount > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="上一张"
                  disabled={pending}
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[var(--border)] bg-[var(--surface)]/90 px-2.5 py-2 text-sm text-[var(--text)] opacity-80 shadow backdrop-blur-sm transition hover:opacity-100 disabled:opacity-40"
                  onClick={() => go(-1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="下一张"
                  disabled={pending}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[var(--border)] bg-[var(--surface)]/90 px-2.5 py-2 text-sm text-[var(--text)] opacity-80 shadow backdrop-blur-sm transition hover:opacity-100 disabled:opacity-40"
                  onClick={() => go(1)}
                >
                  ›
                </button>
              </>
            ) : null}

            {slideCount > 1 ? (
              <div
                className="flex gap-2 overflow-x-auto border-t border-[var(--border-soft)] bg-[var(--surface-2)]/80 px-2 py-2 [-ms-overflow-style:none] [scrollbar-width:thin]"
                role="tablist"
                aria-label="缩略图，点击切换大图"
              >
                {slides.map((img, i) => (
                  <button
                    key={img.kind === "catalog" ? "__catalog_lead__" : img.id}
                    ref={(el) => {
                      thumbRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={i === idx}
                    aria-label={
                      img.kind === "catalog"
                        ? `第 1 张：官方目录图（封面）`
                        : `第 ${i + 1} 张${img.originalName ? `：${img.originalName}` : ""}`
                    }
                    disabled={pending}
                    title={
                      img.kind === "catalog"
                        ? "官方目录图（封面）"
                        : (img.originalName ?? `图片 ${i + 1}`)
                    }
                    className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50 ${
                      i === idx
                        ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-2)]"
                        : "opacity-75 ring-1 ring-[var(--border)] hover:opacity-100"
                    }`}
                    onClick={() => setIdx(i)}
                  >
                    <RemoteCoverImage
                      key={img.kind === "catalog" ? `t-cat-${img.url}` : `t-up-${img.id}`}
                      src={img.url}
                      fill
                      className="object-cover"
                      sizes="56px"
                      alt=""
                      unoptimized={img.kind === "upload"}
                      fallbackLabel="·"
                      fallbackClassName="text-[10px] text-[var(--muted-2)]"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="button-primary cursor-pointer text-xs sm:text-sm">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void onPick(f);
              e.target.value = "";
            }}
          />
          {pending ? "处理中…" : "上传图片"}
        </label>
        {currentIsUpload ? (
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-red-400/40 hover:bg-[var(--danger-soft)] hover:text-red-200/95 sm:text-sm"
            disabled={pending}
            onClick={onDeleteCurrent}
          >
            删除当前图
          </button>
        ) : null}
        {slideCount > 0 ? (
          <span className="text-xs text-[var(--muted)] tabular-nums">
            {idx + 1} / {slideCount}
          </span>
        ) : null}
      </div>

      {current?.kind === "catalog" ? (
        <p className="truncate text-center text-[11px] text-[var(--muted)]">官方目录图（封面）</p>
      ) : current?.originalName ? (
        <p className="truncate text-center text-[11px] text-[var(--muted)]" title={current.originalName}>
          {current.originalName}
        </p>
      ) : null}

      {message ? (
        <p className="text-xs text-emerald-200/95" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-200/95" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
