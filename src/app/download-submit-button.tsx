"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type DownloadSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "secondary" | "outline";
};

export function DownloadSubmitButton({
  children,
  pendingLabel,
  variant,
}: DownloadSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col gap-2">
      <Button type="submit" variant={variant} disabled={pending} className="gap-2">
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {pending ? pendingLabel : children}
      </Button>
      {pending ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          已提交请求，任务创建后会出现在下方下载记录。
        </p>
      ) : null}
    </div>
  );
}
