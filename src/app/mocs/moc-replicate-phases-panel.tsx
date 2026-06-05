"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState, useTransition } from "react";

import {
  deleteReplicatePhaseAction,
  saveReplicatePhaseAction,
  updateReplicatePhaseAction,
  type ReplicatePhaseRow,
} from "@/app/mocs/replicate-phase-actions";
import { RemoteCoverImage } from "@/components/remote-cover-image";
import { BUILD_SUBJECT_MOC } from "@/lib/build-subject";
import { formatIsoDateTimeShort } from "@/lib/format-display-time";
import { replicatePhaseDefaultLabel } from "@/lib/replicate-phase-default-label";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10_485_760 ? 1 : 0)} MB`;
}

const PHASE_FIELD_LABEL_CLASS = "block text-xs text-[var(--muted)]";
const PHASE_INPUT_CLASS =
  "mt-1.5 w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/70 disabled:opacity-40";
const PHASE_TEXTAREA_CLASS = `${PHASE_INPUT_CLASS} min-h-[6.5rem] resize-y leading-relaxed`;

type Props = {
  subjectId: string;
  phases: ReplicatePhaseRow[];
  /** `workspace`：嵌入下半区面板，不重复外层标题与边框 */
  variant?: "standalone" | "workspace";
};

export function MocReplicatePhasesPanel({ subjectId, phases, variant = "standalone" }: Props) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [editPhaseId, setEditPhaseId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editNote, setEditNote] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const defaultNewLabel = replicatePhaseDefaultLabel(phases.length);
  const lightboxPhase = lightboxIndex != null ? phases[lightboxIndex] : null;

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goLightbox = useCallback(
    (delta: number) => {
      if (phases.length <= 1) return;
      setLightboxIndex((prev) => {
        if (prev == null) return prev;
        return (prev + delta + phases.length) % phases.length;
      });
    },
    [phases.length]
  );

  useEffect(() => {
    if (lightboxIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeLightbox();
        return;
      }
      if (phases.length <= 1) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goLightbox(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goLightbox(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLightbox, goLightbox, lightboxIndex, phases.length]);

  const closeSave = useCallback(() => {
    setSaveOpen(false);
    setError(null);
  }, []);

  const onSave = useCallback(
    (formData: FormData) => {
      setMessage(null);
      setError(null);
      startTransition(async () => {
        const r = await saveReplicatePhaseAction(formData);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setSaveOpen(false);
        setMessage("已保存复刻阶段。");
        router.refresh();
      });
    },
    [router]
  );

  const startEdit = useCallback((phase: ReplicatePhaseRow) => {
    setEditPhaseId(phase.id);
    setEditLabel(phase.label);
    setEditNote(phase.note ?? "");
    setMessage(null);
    setError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditPhaseId(null);
    setEditLabel("");
    setEditNote("");
  }, []);

  const onUpdate = useCallback(
    (formData: FormData) => {
      if (editPhaseId == null) return;
      setMessage(null);
      setError(null);
      formData.set("subjectKind", BUILD_SUBJECT_MOC);
      formData.set("subjectId", subjectId);
      formData.set("phaseId", String(editPhaseId));
      formData.set("label", editLabel);
      formData.set("note", editNote);
      startTransition(async () => {
        const r = await updateReplicatePhaseAction(formData);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        cancelEdit();
        setMessage("已更新阶段信息。");
        router.refresh();
      });
    },
    [cancelEdit, editLabel, editNote, editPhaseId, router, subjectId]
  );

  const onDelete = useCallback(
    (phaseId: number) => {
      if (!window.confirm("确定删除该复刻阶段？渲染图与 .io 文件将一并移除。")) return;
      setMessage(null);
      setError(null);
      startTransition(async () => {
        const r = await deleteReplicatePhaseAction(BUILD_SUBJECT_MOC, subjectId, phaseId);
        if (!r.ok) {
          setError(r.error);
          return;
        }
        if (editPhaseId === phaseId) cancelEdit();
        setMessage("已删除复刻阶段。");
        router.refresh();
      });
    },
    [cancelEdit, editPhaseId, router, subjectId]
  );

  return (
    <>
      {variant === "workspace" ? (
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-base font-semibold text-[var(--text)]">复刻阶段</h2>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              复刻大套装时可成对保存 Studio 渲染图与 .io，按时间线记录搭建进度；最新阶段即当前模型快照。
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            className="inline-flex shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text)] hover:border-[var(--accent)]/50 disabled:opacity-40"
            onClick={() => {
              setSaveOpen(true);
              setError(null);
            }}
          >
            {pending && saveOpen ? "处理中…" : "保存阶段"}
          </button>
        </header>
      ) : null}

    <section
      className={
        variant === "workspace"
          ? "replicate-phases-panel space-y-3"
          : "replicate-phases-panel rounded-lg border border-[var(--border-soft)] bg-[var(--surface-2)]/40 px-3 py-3"
      }
    >
      {variant === "standalone" ? (
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-[var(--text)]">
          复刻阶段
          {phases.length > 0 ? (
            <span className="ml-1 font-normal text-[var(--muted)]">({phases.length})</span>
          ) : null}
        </h3>
        <button
          type="button"
          disabled={pending}
          className="inline-flex shrink-0 items-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text)] hover:border-[var(--accent)]/50 disabled:opacity-40"
          onClick={() => {
            setSaveOpen(true);
            setError(null);
          }}
        >
          {pending && saveOpen ? "处理中…" : "保存阶段"}
        </button>
      </div>
      ) : null}

      {phases.length === 0 ? (
        <p className={`leading-relaxed text-[var(--muted)] ${variant === "workspace" ? "text-sm" : "text-xs"}`}>
          完成一块后上传 Studio 渲染图与对应 .io，即可在此记录搭建进度。
        </p>
      ) : (
        <ol className={`space-y-3 ${variant === "workspace" ? "" : "mt-3"}`}>
          {phases.map((phase, index) => {
            const isLatest = index === 0;
            const isEditing = editPhaseId === phase.id;
            const savedAt = formatIsoDateTimeShort(phase.createdAt);

            return (
              <li
                key={phase.id}
                className={`rounded-md border px-2.5 py-2 ${
                  isEditing
                    ? "border-[var(--accent)]/40 bg-[var(--surface-2)]/70 py-3 sm:px-3.5"
                    : isLatest
                      ? "border-[var(--accent)]/35 bg-[var(--surface-2)]/80 text-xs"
                      : "border-[var(--border-soft)] bg-[var(--surface-2)]/50 text-xs"
                }`}
              >
                {isEditing ? (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onUpdate(new FormData(e.currentTarget));
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`relative shrink-0 overflow-hidden rounded border border-[var(--border-soft)] bg-[var(--surface)] ${
                          variant === "workspace" ? "h-16 w-24" : "h-14 w-20"
                        }`}
                      >
                        <RemoteCoverImage
                          src={phase.renderUrl}
                          alt={phase.renderOriginalName ?? phase.label}
                          fill
                          className="object-cover"
                          sizes={variant === "workspace" ? "96px" : "80px"}
                        />
                      </div>
                      <p className="text-sm font-medium text-[var(--text)]">编辑阶段</p>
                    </div>
                    <div className="space-y-3 border-t border-[var(--border-soft)] pt-3">
                      <label className={PHASE_FIELD_LABEL_CLASS}>
                        阶段名称
                        <input
                          type="text"
                          value={editLabel}
                          maxLength={80}
                          disabled={pending}
                          className={PHASE_INPUT_CLASS}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                      </label>
                      <label className={PHASE_FIELD_LABEL_CLASS}>
                        备注（可选）
                        <textarea
                          value={editNote}
                          maxLength={500}
                          rows={4}
                          disabled={pending}
                          placeholder="如步骤范围、本次完成的部分"
                          className={PHASE_TEXTAREA_CLASS}
                          onChange={(e) => setEditNote(e.target.value)}
                        />
                      </label>
                      <label className={PHASE_FIELD_LABEL_CLASS}>
                        更换渲染图（可选）
                        <input
                          type="file"
                          name="renderFile"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          disabled={pending}
                          className="mt-1 block w-full text-xs text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-xs"
                        />
                      </label>
                      <label className={PHASE_FIELD_LABEL_CLASS}>
                        更换 Studio .io（可选）
                        {phase.ioOriginalName ? (
                          <span className="ml-1 text-[var(--muted)]/80">
                            当前：{phase.ioOriginalName}
                          </span>
                        ) : null}
                        <input
                          type="file"
                          name="ioFile"
                          accept=".io,application/zip,application/x-zip-compressed"
                          disabled={pending}
                          className="mt-1 block w-full text-xs text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-xs"
                        />
                      </label>
                      <div className="flex flex-wrap justify-end gap-2 pt-0.5">
                        <button
                          type="button"
                          disabled={pending}
                          className="rounded-md px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                          onClick={cancelEdit}
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-3 py-1.5 text-xs text-[var(--text)] disabled:opacity-40"
                        >
                          {pending ? "保存中…" : "保存"}
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    className={`relative block shrink-0 overflow-hidden rounded border border-[var(--border-soft)] bg-[var(--surface)] cursor-zoom-in ${
                      variant === "workspace" ? "h-24 w-36" : "h-16 w-24"
                    }`}
                    title="查看大图"
                    aria-label={`查看 ${phase.label} 渲染大图`}
                    onClick={() => openLightbox(index)}
                  >
                    <RemoteCoverImage
                      src={phase.renderUrl}
                      alt={phase.renderOriginalName ?? phase.label}
                      fill
                      className="object-cover"
                      sizes={variant === "workspace" ? "144px" : "96px"}
                    />
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className="font-medium text-[var(--text)]">{phase.label}</p>
                      {isLatest ? (
                        <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                          当前进度
                        </span>
                      ) : null}
                    </div>
                    {savedAt ? (
                      <p className="mt-0.5 tabular-nums text-[var(--muted)]">{savedAt}</p>
                    ) : null}
                    {phase.note ? (
                      <p className="mt-1 line-clamp-2 text-[var(--muted)]">{phase.note}</p>
                    ) : null}

                      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
                        <button
                          type="button"
                          className="text-[var(--accent)] underline underline-offset-2"
                          onClick={() => openLightbox(index)}
                        >
                          查看大图
                        </button>
                        <a
                          href={phase.ioUrl}
                          className="text-[var(--accent)] underline underline-offset-2"
                          download
                        >
                          下载 .io
                          <span className="ml-1 tabular-nums text-[var(--muted)] no-underline">
                            ({formatBytes(phase.ioByteSize)})
                          </span>
                        </a>
                        <button
                          type="button"
                          disabled={pending}
                          className="text-[var(--muted)] underline-offset-2 hover:text-[var(--text)] hover:underline disabled:opacity-40"
                          onClick={() => startEdit(phase)}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="text-[var(--muted)] underline-offset-2 hover:text-red-200/95 hover:underline disabled:opacity-40"
                          onClick={() => onDelete(phase.id)}
                        >
                          删除
                        </button>
                      </div>
                  </div>
                </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {saveOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) closeSave();
          }}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-[var(--border-soft)] bg-[var(--surface)] p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${formId}-title`}
          >
            <h4 id={`${formId}-title`} className="text-sm font-medium text-[var(--text)]">
              保存复刻阶段
            </h4>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                onSave(new FormData(e.currentTarget));
              }}
            >
              <input type="hidden" name="subjectKind" value={BUILD_SUBJECT_MOC} />
              <input type="hidden" name="subjectId" value={subjectId} />

              <label className={PHASE_FIELD_LABEL_CLASS}>
                <span className="text-[var(--muted)]">阶段名称</span>
                <input
                  type="text"
                  name="label"
                  defaultValue={defaultNewLabel}
                  maxLength={80}
                  disabled={pending}
                  className={PHASE_INPUT_CLASS}
                />
              </label>

              <label className={PHASE_FIELD_LABEL_CLASS}>
                <span className="text-[var(--muted)]">备注（可选）</span>
                <textarea
                  name="note"
                  rows={4}
                  maxLength={500}
                  disabled={pending}
                  placeholder="如步骤范围、本次完成的部分"
                  className={PHASE_TEXTAREA_CLASS}
                />
              </label>

              <label className={PHASE_FIELD_LABEL_CLASS}>
                <span className="text-[var(--muted)]">渲染图 *</span>
                <input
                  type="file"
                  name="renderFile"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  required
                  disabled={pending}
                  className="mt-1 block w-full text-xs text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-xs"
                />
              </label>

              <label className="block text-xs">
                <span className="text-[var(--muted)]">Studio .io *</span>
                <input
                  type="file"
                  name="ioFile"
                  accept=".io,application/zip,application/x-zip-compressed"
                  required
                  disabled={pending}
                  className="mt-1 block w-full text-xs text-[var(--text)] file:mr-2 file:rounded file:border-0 file:bg-[var(--surface-2)] file:px-2 file:py-1 file:text-xs"
                />
              </label>

              {error && saveOpen ? (
                <p className="text-xs text-red-200/95" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                  onClick={closeSave}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md border border-[var(--accent)]/50 bg-[var(--accent)]/10 px-3 py-1.5 text-xs text-[var(--text)] disabled:opacity-40"
                >
                  {pending ? "保存中…" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {lightboxPhase && lightboxIndex != null ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/82 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label={
            phases.length > 1
              ? `阶段渲染大图，第 ${lightboxIndex + 1} 个，共 ${phases.length} 个`
              : "阶段渲染大图"
          }
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-[101] rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="关闭大图预览"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
          >
            关闭
          </button>
          {phases.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="上一阶段"
                className="absolute left-3 top-1/2 z-[101] -translate-y-1/2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-2xl leading-none text-white shadow backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-5"
                onClick={(e) => {
                  e.stopPropagation();
                  goLightbox(-1);
                }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="下一阶段"
                className="absolute right-3 top-1/2 z-[101] -translate-y-1/2 rounded-full border border-white/25 bg-white/10 px-3 py-2 text-2xl leading-none text-white shadow backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-5"
                onClick={(e) => {
                  e.stopPropagation();
                  goLightbox(1);
                }}
              >
                ›
              </button>
            </>
          ) : null}
          <div
            className="relative flex max-h-[min(92vh,100%)] max-w-full flex-col items-center overflow-auto px-10 sm:px-14"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 灯箱需原生 img 以支持本地上传 URL */}
            <img
              key={lightboxPhase.id}
              src={lightboxPhase.renderUrl}
              alt={lightboxPhase.renderOriginalName ?? lightboxPhase.label}
              className="max-h-[88vh] w-auto max-w-full object-contain shadow-2xl"
            />
            <p className="mt-3 max-w-prose text-center text-sm text-white/90">{lightboxPhase.label}</p>
            {phases.length > 1 ? (
              <p className="mt-1 text-center text-xs tabular-nums text-white/75">
                {lightboxIndex + 1} / {phases.length}
              </p>
            ) : null}
          </div>
          <p className="mt-2 max-w-prose text-center text-xs text-white/75">
            {phases.length > 1
              ? "左右方向键或两侧箭头切换阶段；点击背景或「关闭」退出，按 Esc 亦可关闭。"
              : "点击背景或「关闭」退出；按 Esc 亦可关闭。"}
          </p>
        </div>
      ) : null}

      {message ? (
        <p className="mt-2 text-xs text-emerald-200/95" role="status">
          {message}
        </p>
      ) : null}
      {error && !saveOpen ? (
        <p className="mt-2 text-xs text-red-200/95" role="alert">
          {error}
        </p>
      ) : null}
    </section>
    </>
  );
}

export type { ReplicatePhaseRow };
