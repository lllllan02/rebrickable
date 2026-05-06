"use client";

import { useActionState, useEffect } from "react";

import { downloadPartCatalogFormAction } from "../actions";
import { DownloadSubmitButton } from "../download-submit-button";

const initialState = {
  ok: false,
  message: "",
};

export function CatalogDownloadForm() {
  const [state, formAction] = useActionState(downloadPartCatalogFormAction, initialState);

  useEffect(() => {
    if (state.ok) {
      window.dispatchEvent(new Event("download-jobs:refresh"));
    }
  }, [state]);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-3">
      <DownloadSubmitButton pendingLabel="正在创建索引下载任务...">
        下载全量零件配色索引
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
