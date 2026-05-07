"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type DownloadSubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "default" | "secondary" | "outline";
  /** 外层容器 className */
  className?: string;
  /** 为 false 时不展示提交后的说明段落（紧凑布局用） */
  showPendingHint?: boolean;
  pendingHintClassName?: string;
};

export function DownloadSubmitButton({
  children,
  pendingLabel,
  variant,
  className,
  showPendingHint = true,
  pendingHintClassName,
}: DownloadSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Button type="submit" variant={variant} disabled={pending} className="gap-2">
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
        {pending ? pendingLabel : children}
      </Button>
      {pending && showPendingHint ? (
        <p
          className={cn("text-sm text-slate-500", pendingHintClassName)}
          aria-live="polite"
        >
          已提交请求，任务创建后会出现在下方下载记录。
        </p>
      ) : null}
    </div>
  );
}
