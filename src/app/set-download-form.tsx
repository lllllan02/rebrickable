"use client";

import { useActionState, useEffect } from "react";

import { Input } from "@/components/ui/input";
import { downloadSetFormAction } from "./actions";
import { DownloadSubmitButton } from "./download-submit-button";

const initialState = {
  ok: false,
  message: "",
};

export function SetDownloadForm() {
  const [state, formAction] = useActionState(downloadSetFormAction, initialState);

  useEffect(() => {
    if (state.ok) {
      window.dispatchEvent(new Event("download-jobs:refresh"));
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-3">
      <Input name="setNum" placeholder="例如 10316-1" required />
      <DownloadSubmitButton pendingLabel="正在创建下载任务...">
        下载 Set 数据
      </DownloadSubmitButton>
      {state.message ? (
        <p
          className={state.ok ? "text-sm text-blue-600" : "text-sm text-red-600"}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
