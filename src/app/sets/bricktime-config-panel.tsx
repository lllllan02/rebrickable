"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  refreshBricktimeApiKeyAction,
  saveBricktimeConfigAction,
  type BricktimeConfigPublic,
} from "@/app/sets/bricktime-config-actions";
import { goodPriceBtnPrimary, goodPriceBtnSecondary } from "@/lib/set-good-price-buttons";
import { formatIsoDateTimeLocale } from "@/lib/format-display-time";

type Props = {
  initialConfig: BricktimeConfigPublic;
};

function formatExpiresAt(isoLike: string | null): string | null {
  if (!isoLike?.trim()) return null;
  return formatIsoDateTimeLocale(isoLike) ?? isoLike;
}

export function BricktimeConfigPanel({ initialConfig }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(!initialConfig.hasApiKey);
  const [config, setConfig] = useState(initialConfig);
  const [error, setError] = useState<string | null>(null);
  const [uuidInput, setUuidInput] = useState(initialConfig.userUuid ?? "");
  const [apiKeyInput, setApiKeyInput] = useState("");

  const expiresLabel = formatExpiresAt(config.apiKeyExpiresAt);

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveBricktimeConfigAction({
        userUuid: uuidInput,
        apiKey: apiKeyInput,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfig(res.config);
      setApiKeyInput("");
      router.refresh();
    });
  };

  const refreshKey = () => {
    setError(null);
    startTransition(async () => {
      const res = await refreshBricktimeApiKeyAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfig(res.config);
      router.refresh();
    });
  };

  const inputClass =
    "rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 font-mono text-sm text-[var(--text)] outline-none ring-[var(--accent)]/20 focus-visible:ring-2 w-full";

  return (
    <div className="mb-3 rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]/40 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">Bricktime 配置</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            填写小程序 UUID 后可自动申请 API Key；免费 Key 约 15 天过期，过期后会自动续期。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={goodPriceBtnSecondary}
        >
          {open ? "收起" : "配置"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <span>
          UUID：{config.userUuid ? <span className="font-mono text-[var(--text)]">{config.userUuid}</span> : "未配置"}
        </span>
        <span>
          API Key：{config.hasApiKey ? <span className="font-mono text-[var(--text)]">{config.apiKeyMasked}</span> : "未配置"}
        </span>
        {expiresLabel ? (
          <span className={config.isExpired ? "text-amber-300" : undefined}>
            过期：{expiresLabel}
            {config.isExpired ? "（已过期，下次抓取会自动续期）" : ""}
          </span>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-[var(--border-soft)] pt-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">小程序 UUID</span>
            <input
              type="text"
              value={uuidInput}
              onChange={(e) => setUuidInput(e.target.value)}
              placeholder="72e73048-f067-40cb-a13e-63d09822de01"
              disabled={pending}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--muted)]">API Key（可选，手动填写则优先使用）</span>
            <input
              type="text"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="留空则保存 UUID 后自动申请"
              disabled={pending}
              className={inputClass}
            />
          </label>

          <p className="text-xs text-[var(--muted)]">
            UUID 在微信搜索「积木小时光」小程序 → 我的 → 底部点击 ID 复制。保存 UUID 时会立即尝试申请或读取 API Key。
          </p>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={pending} className={goodPriceBtnPrimary}>
              {pending ? "保存中…" : "保存并同步 Key"}
            </button>
            <button
              type="button"
              onClick={refreshKey}
              disabled={pending || !config.userUuid}
              className={goodPriceBtnSecondary}
            >
              {pending ? "刷新中…" : "刷新 API Key"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
