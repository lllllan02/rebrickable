import { PartsSheetImport } from "./parts-sheet-import";

export default function PartsSheetPage() {
  return (
    <div className="page-stack">
      <section className="hero-panel">
        <p className="page-kicker">Parts sheet</p>
        <h1 className="page-title">零件表</h1>
        <p className="page-description">
          导入与{" "}
          <code className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[13px]">
            rebrickable_parts_*_缺货表.csv
          </code>{" "}
          相同结构的 CSV：按{" "}
          <span className="font-medium text-[var(--text)]">part_num</span>{" "}
          在本地库中精确匹配零件，并尽量按{" "}
          <span className="font-medium text-[var(--text)]">颜色 ID</span>{" "}
          从库存数据中选取缩略图（若无同色图则退化为该零件任意一色图片）。
        </p>
      </section>
      <PartsSheetImport />
    </div>
  );
}
