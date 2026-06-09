"use client";

import { useRef, useEffect, useCallback } from "react";

const COL_COUNT = 8;
const MIN_COL_WIDTH = 50;

export function RosterShell({ children }: { children: React.ReactNode }) {
  const rosterRef = useRef<HTMLDivElement>(null);
  const colWidths = useRef<(number | null)[]>(Array(COL_COUNT).fill(null));
  const dragState = useRef<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  const applyWidth = useCallback((colIndex: number, width: number | null) => {
    const el = rosterRef.current;
    if (!el) return;
    const prop = `--rc-${colIndex}`;
    if (width === null) {
      el.style.removeProperty(prop);
    } else {
      el.style.setProperty(prop, `${width}px`);
    }
    colWidths.current[colIndex] = width;
  }, []);

  useEffect(() => {
    const roster = rosterRef.current;
    if (!roster) return;

    const head = roster.querySelector(".pp-roster-head") as HTMLElement | null;
    if (!head) return;

    const cells = Array.from(head.children) as HTMLElement[];
    const handles: HTMLElement[] = [];

    cells.forEach((cell, i) => {
      if (i >= COL_COUNT - 1) return;
      cell.style.position = "relative";

      const handle = document.createElement("div");
      handle.className = "pp-resize-handle";

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const currentWidth = cells[i].getBoundingClientRect().width;
        colWidths.current[i] = currentWidth;
        dragState.current = {
          colIndex: i,
          startX: e.clientX,
          startWidth: currentWidth,
        };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        roster.classList.add("is-resizing");
      });

      handle.addEventListener("dblclick", () => {
        applyWidth(i, null);
      });

      cell.appendChild(handle);
      handles.push(handle);
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const { colIndex, startX, startWidth } = dragState.current;
      const diff = e.clientX - startX;
      const newWidth = Math.max(MIN_COL_WIDTH, startWidth + diff);
      applyWidth(colIndex, newWidth);
    };

    const onMouseUp = () => {
      if (!dragState.current) return;
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      roster.classList.remove("is-resizing");
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      handles.forEach((h) => h.remove());
    };
  }, [applyWidth]);

  return (
    <div className="pp-roster" ref={rosterRef}>
      {children}
    </div>
  );
}
