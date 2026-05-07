"use client";

import { mocAttachmentTypes, mocAttachmentTypeLabel } from "@/lib/moc-attachment-kind";
import { cn } from "@/lib/utils";

const selectClassName = cn(
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-slate-400",
);

type MocAttachmentUploadFieldsProps = {
  /** 为 true 时附件为选填（导入页与清单同时提交）。 */
  optional?: boolean;
};

export function MocAttachmentUploadFields({ optional = false }: MocAttachmentUploadFieldsProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-700">
          附件（说明书、.io、压缩包等）
          {optional ? <span className="font-normal text-slate-500">（可选）</span> : null}
        </span>
        <p className="text-xs text-slate-500">
          可多选。类型选「自动」时按扩展名归类（如 .io → Stud.io，.pdf → 说明书，.ldr/.lxf →
          LDraw/交换格式，压缩包、图片等）。
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-700">附件类型</span>
        <select name="attachmentKind" defaultValue="auto" className={selectClassName}>
          <option value="auto">自动识别（按扩展名）</option>
          {mocAttachmentTypes.map((t) => (
            <option key={t} value={t}>
              {mocAttachmentTypeLabel(t)}（全部文件使用此类型）
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-slate-700">选择文件</span>
        <input
          name="attachments"
          type="file"
          multiple
          className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800 hover:file:bg-slate-200"
        />
      </label>
    </div>
  );
}
