import type { SheetRowThumbMismatchKind } from "@/lib/parts-sheet-row-thumb";
import { sheetThumbMismatchLabel } from "@/lib/parts-sheet-row-thumb";

type Props = {
  kind: SheetRowThumbMismatchKind;
  /** 角标式（网格小图）或条带式（较大预览） */
  variant?: "chip" | "banner";
  className?: string;
};

const VARIANT_CLASS: Record<NonNullable<Props["variant"]>, string> = {
  chip:
    "absolute inset-x-0 bottom-0 z-[2] bg-amber-500/92 py-0.5 text-center text-[8px] font-bold leading-none tracking-wide text-amber-950 shadow-[0_-1px_0_rgba(0,0,0,0.2)] sm:text-[9px]",
  banner:
    "mt-1 rounded border border-amber-400/45 bg-amber-500/15 px-1.5 py-0.5 text-center text-[10px] font-semibold leading-snug text-amber-100/95 sm:text-[11px]",
};

/** 缩略图为异色/非本行色示意时在图上或图下醒目标注 */
export function SheetThumbMismatchOverlay({
  kind,
  variant = "chip",
  className = "",
}: Props) {
  return (
    <span
      className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      title={
        kind === "gds"
          ? "图为高砖其它配色，与本行乐高色 ID 不一致"
          : "本行颜色无库存图，图为其它配色示意（缺色）"
      }
    >
      {sheetThumbMismatchLabel(kind)}
    </span>
  );
}
