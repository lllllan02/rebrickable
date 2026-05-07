import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";

import { MocImportForm } from "@/app/moc-import-form";

export const dynamic = "force-dynamic";

export default function MocImportPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-8">
      <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
        <div className="flex items-start gap-4">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
            <Upload className="h-6 w-6" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-slate-300">手动导入</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">导入 MOC 零件清单</h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-300">
              请在网页导出零件清单（CSV / JSON）并可选上传说明书、Stud.io（.io）、LDraw
              等附件。导入会覆盖该 MOC ID 下已有的 <code className="rounded bg-white/10 px-1">moc_parts</code>
              ；附件为追加保存（同次提交一并写入）。
            </p>
          </div>
        </div>
      </header>

      <Card className="p-6 md:p-8">
        <CardTitle className="text-xl">上传表单</CardTitle>
        <CardDescription className="mt-2">
          CSV 示例表头：<span className="font-mono text-slate-700">part_num,color_id,quantity</span>
          ；也可使用 Rebrickable 导出中对应的 Part / Color / Qty 列名。附件单文件上限 50MB，单次最多 15
          个。
        </CardDescription>
        <div className="mt-6">
          <MocImportForm />
        </div>
      </Card>
    </main>
  );
}
