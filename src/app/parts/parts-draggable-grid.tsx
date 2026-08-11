"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { PART_GROUP_DND_MIME } from "@/lib/part-group-dnd";

/**
 * 在 `by=group` 模式下，为方格列表启用拖拽。
 * 子节点需为带 `data-part-num` 的 `<li>`（或一层包装）。
 */
export function PartsDraggableGrid({
  enabled,
  children,
  className = "tiles-grid",
}: {
  enabled: boolean;
  children: ReactNode;
  className?: string;
}) {
  const suppressClickUntil = useRef(0);

  if (!enabled) {
    return (
      <ul className={className} role="list">
        {children}
      </ul>
    );
  }

  return (
    <ul
      className={className}
      role="list"
      onClickCapture={(e) => {
        if (Date.now() < suppressClickUntil.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<{
          "data-part-num"?: string;
          draggable?: boolean;
          onDragStart?: (e: DragEvent) => void;
          className?: string;
          children?: ReactNode;
        }>;
        const partNum = el.props["data-part-num"];
        if (!partNum) return child;

        return cloneElement(el, {
          draggable: true,
          className: `${el.props.className ?? ""} cursor-grab active:cursor-grabbing`.trim(),
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.setData(PART_GROUP_DND_MIME, partNum);
            e.dataTransfer.setData("text/plain", partNum);
            e.dataTransfer.effectAllowed = "copy";
            suppressClickUntil.current = Date.now() + 400;
          },
        });
      })}
    </ul>
  );
}
