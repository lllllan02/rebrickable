"use client";

import { useActionState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { downloadMocFormAction } from "./actions";
import { DownloadSubmitButton } from "./download-submit-button";

const initialState = {
  ok: false,
  message: "",
};

export type MocDownloadFormProps = {
  presetMocId?: string;
  lockMocId?: boolean;
  layout?: "default" | "toolbar";
};

export function MocDownloadForm({
  presetMocId,
  lockMocId,
  layout = "default",
}: MocDownloadFormProps = {}) {
  const [state, formAction] = useActionState(downloadMocFormAction, initialState);

  useEffect(() => {
    if (state.ok || state.message) {
      window.dispatchEvent(new Event("download-jobs:refresh"));
    }
  }, [state.ok, state.message]);

  const locked = Boolean(lockMocId && presetMocId);
  const toolbar = layout === "toolbar";

  return (
    <form
      action={formAction}
      className={cn(
        toolbar
          ? "mt-0 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-2"
          : "mt-5 flex flex-col gap-3",
      )}
    >
      {locked ? (
        <input type="hidden" name="mocId" value={presetMocId} />
      ) : (
        <Input
          name="mocId"
          placeholder="例如 123456 或 MOC-123456"
          required
          defaultValue={presetMocId}
          className={cn(toolbar && "min-w-0 flex-1 sm:max-w-[14rem] md:max-w-xs")}
        />
      )}
      <DownloadSubmitButton
        pendingLabel="正在创建任务..."
        variant={toolbar ? "secondary" : undefined}
        className={cn(toolbar && "sm:w-auto sm:shrink-0")}
        showPendingHint={!toolbar}
      >
        {locked ? "再次尝试 MOC 下载" : "检查 MOC ID"}
      </DownloadSubmitButton>
      {state.message ? (
        <p
          className={cn(
            "text-sm",
            toolbar ? "w-full basis-full" : "",
            state.ok
              ? toolbar
                ? "text-sky-300"
                : "text-blue-600"
              : toolbar
                ? "text-red-300"
                : "text-red-600",
          )}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
