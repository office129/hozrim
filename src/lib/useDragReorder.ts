"use client";

import { useRef } from "react";

// Native HTML5 drag & drop reordering, mirroring the original prototype's
// drag-handle behavior: dragging one row over another swaps their position
// and the caller persists the new order (server renumbers 1..N).
export function useDragReorder<T extends { id: string }>(
  items: T[],
  onReorder: (orderedIds: string[]) => void
) {
  const dragIndex = useRef<number | null>(null);

  function bind(index: number) {
    return {
      draggable: true,
      onDragStart: () => {
        dragIndex.current = index;
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = dragIndex.current;
        dragIndex.current = null;
        if (from === null || from === index) return;
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(index, 0, moved);
        onReorder(next.map((i) => i.id));
      },
    };
  }

  return { bind };
}
