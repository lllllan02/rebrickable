"use client";

import { useActionState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { downloadSetFormAction } from "./actions";
import { DownloadSubmitButton } from "./download-submit-button";

const initialState = {
  ok: false,
  message: "",
};

export type SetDownloadFormProps = {
  /** 预填 Set ID；与 `lockSetNum` 一起用时通过隐藏字段提交 */
  presetSetNum?: string;
  /** 为 true 时不展示输入框，仅下载 `presetSetNum` 对应套装 */
  lockSetNum?: boolean;
  /** `toolbar`：单行/横排紧凑样式，适合深色页头 */
  layout?: "default" | "toolbar";
};

export function SetDownloadForm({
  presetSetNum,
  lockSetNum,
  layout = "default",
}: SetDownloadFormProps = {}) {
  const [state, formAction] = useActionState(downloadSetFormAction, initialState);

  useEffect(() => {
    if (state.ok) {
      window.dispatchEvent(new Event("download-jobs:refresh"));
    }
  }, [state]);

  const locked = Boolean(lockSetNum && presetSetNum);
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
        <input type="hidden" name="setNum" value={presetSetNum} />
      ) : (
        <Input
          name="setNum"
          placeholder="例如 10316-1"
          required
          defaultValue={presetSetNum}
          className={cn(toolbar && "min-w-0 flex-1 sm:max-w-[14rem] md:max-w-xs")}
        />
      )}
      <DownloadSubmitButton
        pendingLabel="正在创建下载任务..."
        variant={toolbar ? "secondary" : undefined}
        className={cn(toolbar && "sm:w-auto sm:shrink-0")}
        showPendingHint={!toolbar}
      >
        {locked ? "重新下载此套装" : "下载 Set 数据"}
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
