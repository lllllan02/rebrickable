import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const styles = {
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  running: "bg-blue-50 text-blue-700",
  pending: "bg-amber-50 text-amber-700",
  default: "bg-slate-100 text-slate-700",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof styles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        styles[tone],
        className,
      )}
      {...props}
    />
  );
}
