"use client";

import { useActionState } from "react";

import { appendMocAttachmentsFormAction } from "@/app/actions";
import { MocAttachmentUploadFields } from "@/app/moc-attachment-upload-fields";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState = {
  ok: false,
  message: "",
};

type MocAppendAttachmentsFormProps = {
  mocId: number;
};

export function MocAppendAttachmentsForm({ mocId }: MocAppendAttachmentsFormProps) {
  const [state, formAction] = useActionState(appendMocAttachmentsFormAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="mocId" value={String(mocId)} />
      <MocAttachmentUploadFields />
      <Button type="submit" variant="outline">
        上传附件
      </Button>
      {state.message ? (
        <p className={cn("text-sm", state.ok ? "text-emerald-700" : "text-red-600")} aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
