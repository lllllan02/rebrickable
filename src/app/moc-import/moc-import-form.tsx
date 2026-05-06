"use client";

import Link from "next/link";
import { useActionState } from "react";

import { importMocInventoryFormAction, type MocImportActionResult } from "../actions";
import { DownloadSubmitButton } from "../download-submit-button";

const initialState: MocImportActionResult = {
  ok: false,
  message: "",
};

export function MocImportForm() {
  const [state, formAction] = useActionState(importMocInventoryFormAction, initialState);

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
        MOC 零件 CSV
        <input
          name="inventoryFile"
          type="file"
          accept=".csv,text/csv"
          required
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium focus:border-slate-400"
        />
      </label>

      <DownloadSubmitButton variant="secondary" pendingLabel="正在过滤 MOC 清单...">
        生成高砖导入前清单
      </DownloadSubmitButton>

      {state.message ? (
        <p
          className={state.ok ? "text-sm text-blue-600" : "text-sm text-red-600"}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}

      {state.summary ? (
        <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-slate-500">识别行数</p>
            <p className="mt-1 text-xl font-semibold">{state.summary.totalRows}</p>
          </div>
          <div>
            <p className="text-slate-500">可导入行</p>
            <p className="mt-1 text-xl font-semibold">{state.summary.filteredRows}</p>
          </div>
          <div>
            <p className="text-slate-500">替换配色</p>
            <p className="mt-1 text-xl font-semibold">{state.summary.replacedRows}</p>
          </div>
          <div>
            <p className="text-slate-500">需手工处理</p>
            <p className="mt-1 text-xl font-semibold">{state.summary.rejectedRows}</p>
          </div>
        </div>
      ) : null}

      {state.files ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={state.files.filteredCsv}
            target="_blank"
            className="font-medium text-slate-600 transition-colors hover:text-slate-950"
          >
            filtered-for-gobricks.csv
          </Link>
          <Link
            href={state.files.rejectedCsv}
            target="_blank"
            className="font-medium text-slate-600 transition-colors hover:text-slate-950"
          >
            rejected.csv
          </Link>
        </div>
      ) : null}

      {state.summary?.parseWarnings.length ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">解析时跳过了部分行：</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {state.summary.parseWarnings.slice(0, 5).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
