"use client";

import type { ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function buildBrowseSearchParams(form: HTMLFormElement) {
  const fd = new FormData(form);
  const q = String(fd.get("q") ?? "").trim();
  const category = String(fd.get("category") ?? "");
  const color = String(fd.get("color") ?? "");
  const params = new URLSearchParams();
  if (q) {
    params.set("q", q);
  }
  if (category) {
    params.set("category", category);
  }
  if (color) {
    params.set("color", color);
  }
  return params;
}

type CategoryRow = { id: number; name: string; count: number };
type ColorRow = { id: number; name: string; count: number };

type PartsBrowseFiltersFormProps = {
  formKey: string;
  query: string;
  categoryId: number | undefined;
  colorId: number | undefined;
  categories: CategoryRow[];
  colors: ColorRow[];
};

export function PartsBrowseFiltersForm({
  formKey,
  query,
  categoryId,
  colorId,
  categories,
  colors,
}: PartsBrowseFiltersFormProps) {
  const router = useRouter();

  function applyBrowseFiltersOnly(event: ChangeEvent<HTMLSelectElement>) {
    const form = event.currentTarget.form;
    if (!form) {
      return;
    }
    const params = buildBrowseSearchParams(form);
    const s = params.toString();
    router.push(`/parts${s ? `?${s}` : ""}`);
  }

  return (
    <form
      key={formKey}
      action="/parts"
      method="get"
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
    >
      <Input
        name="q"
        defaultValue={query}
        placeholder="编号、名称或分类"
        className="h-9 sm:min-w-[200px] sm:flex-1"
      />
      <select
        name="category"
        defaultValue={categoryId ?? ""}
        onChange={applyBrowseFiltersOnly}
        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400 sm:w-44"
      >
        <option value="">全部分类</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name} ({formatNumber(category.count)})
          </option>
        ))}
      </select>
      <select
        name="color"
        defaultValue={colorId ?? ""}
        onChange={applyBrowseFiltersOnly}
        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400 sm:w-44"
      >
        <option value="">全部颜色</option>
        {colors.map((color) => (
          <option key={color.id} value={color.id}>
            {color.name} ({formatNumber(color.count)})
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          type="submit"
          className="h-9 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
        >
          查询
        </button>
        <Link
          href="/parts"
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 px-3 text-sm text-slate-600 hover:text-slate-950"
        >
          重置
        </Link>
      </div>
    </form>
  );
}
