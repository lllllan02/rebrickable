"use client";

import type { ChangeEventHandler, ComponentPropsWithoutRef } from "react";

type Props = Omit<ComponentPropsWithoutRef<"select">, "onChange"> & {
  onChange?: ChangeEventHandler<HTMLSelectElement>;
};

/** 变更后立即提交所在 GET 表单（用于筛选器等） */
export function AutoSubmitSelect({ onChange, ...rest }: Props) {
  return (
    <select
      {...rest}
      onChange={(e) => {
        onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
