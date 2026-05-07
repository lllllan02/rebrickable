"use client";

import { useActionState } from "react";
import Link from "next/link";

import { importMocInventoryFormAction } from "@/app/actions";
import { MocAttachmentUploadFields } from "@/app/moc-attachment-upload-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState = {
  ok: false,
  message: "",
};

export function MocImportForm() {
  const [state, formAction] = useActionState(importMocInventoryFormAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700">
            MOC ID <span className="text-red-600">*</span>
          </span>
          <Input name="mocId" type="text" inputMode="numeric" placeholder="例如 123456" required />
          <span className="text-xs text-slate-500">建议与 Rebrickable 页面上的 MOC 编号一致，便于对照。</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700">
            名称 <span className="text-red-600">*</span>
          </span>
          <Input name="name" type="text" placeholder="MOC 标题" required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700">作者</span>
          <Input name="designerName" type="text" placeholder="可选" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-slate-700">来源套装 Set ID</span>
          <Input name="sourceSetNum" type="text" placeholder="例如 31109-1，可选" />
          <span className="text-xs text-slate-500">填写后会在对应套装详情页「关联 MOC」中显示。</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">Rebrickable 链接</span>
          <Input name="rebrickableUrl" type="url" placeholder="https://rebrickable.com/mocs/… 可选" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">封面图 URL</span>
          <Input name="imageUrl" type="url" placeholder="可选" />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-700">
          零件清单文件 <span className="text-red-600">*</span>
        </span>
        <input
          name="inventory"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          required
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
        />
        <span className="text-xs text-slate-500">
          支持从网页导出的 <strong className="font-medium">CSV</strong>（表头含零件号、Rebrickable 颜色 ID、数量）或{" "}
          <strong className="font-medium">JSON</strong>
          （根为数组或带 <code className="rounded bg-slate-100 px-1">parts</code> 字段）。颜色与零件号均为
          Rebrickable 体系；缺失的零件/颜色会写入占位记录以便外键成立。
        </span>
      </label>

      <MocAttachmentUploadFields optional />

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-700">备注</span>
        <textarea
          name="notes"
          rows={3}
          placeholder="可选"
          className={cn(
            "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400",
          )}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">导入并写入数据库</Button>
        <Link href="/mocs" className="text-sm font-medium text-blue-700 hover:underline">
          返回 MOC 列表
        </Link>
      </div>

      {state.message ? (
        <p
          className={cn("text-sm", state.ok ? "text-emerald-700" : "text-red-600")}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
