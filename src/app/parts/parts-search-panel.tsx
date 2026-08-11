import { AutoSubmitSelect } from "@/components/auto-submit-select";

export function PartsSearchPanel({
  q,
  piece,
  catId,
}: {
  q: string;
  piece: "plain" | "printed" | null;
  catId: number | null;
}) {
  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
      aria-labelledby="parts-search-heading"
    >
      <h2
        id="parts-search-heading"
        className="text-xs font-semibold text-[var(--text)]"
      >
        搜索
      </h2>
      <form method="get" action="/parts" className="mt-2 flex flex-col gap-2">
        {catId !== null ? (
          <input type="hidden" name="cat" value={String(catId)} />
        ) : null}
        <label className="sr-only" htmlFor="parts-q">
          搜索零件
        </label>
        <input
          id="parts-q"
          name="q"
          defaultValue={q}
          placeholder="名称 / part_num / element…"
          className="field w-full text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <label className="sr-only" htmlFor="parts-piece">
          普通或印刷
        </label>
        <AutoSubmitSelect
          id="parts-piece"
          name="piece"
          defaultValue={piece ?? ""}
          className="field w-full text-xs"
        >
          <option value="">全部零件</option>
          <option value="plain">普通零件</option>
          <option value="printed">印刷件</option>
        </AutoSubmitSelect>
        <button type="submit" className="button-primary w-full text-xs">
          搜索
        </button>
      </form>
    </section>
  );
}
