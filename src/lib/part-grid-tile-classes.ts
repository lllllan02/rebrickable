/** 零件方格列表中单卡基础样式（零件列表、拥有页、MOC/套装零件表共用） */
export const PART_GRID_TILE_CLASS_BASE =
  "group relative flex h-full min-h-0 cursor-pointer flex-col overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-1 pb-1.5 text-left shadow-[var(--shadow)] transition-[border-color,transform,background-color,box-shadow] duration-150 hover:-translate-y-px hover:border-amber-400/45 hover:bg-[linear-gradient(180deg,rgba(247,200,75,0.08),rgba(255,255,255,0.025))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/** 已在「拥有」中登记：与全站 accent 一致的金色描边（叠在 BASE 之后） */
export const PART_GRID_TILE_OWNED_HIGHLIGHT =
  "!border-2 !border-[rgba(247,200,75,0.52)] [box-shadow:var(--shadow),0_0_0_1px_rgba(247,200,75,0.1)] hover:!border-[rgba(255,220,130,0.7)]";

/** 配货/缺件表中该行曾通过「更换零件」写入（优先于拥有高亮展示） */
export const PART_GRID_TILE_SHEET_ROW_MODIFIED =
  "!border-2 !border-sky-400/50 [box-shadow:var(--shadow),0_0_0_1px_rgba(56,189,248,0.12)] hover:!border-sky-400/70";
