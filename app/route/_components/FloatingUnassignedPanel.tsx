"use client";

import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";

type Position = { right: number; bottom: number };

/** Move by the pill/header without interfering with job-card drag and drop. */
export default function FloatingUnassignedPanel({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position>({ right: 16, bottom: 16 });
  const dragRef = useRef<{
    pointerId: number; x: number; y: number; origin: Position; moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  function clamp(next: Position): Position {
    const rect = panelRef.current?.getBoundingClientRect();
    return {
      right: Math.max(8, Math.min(next.right, window.innerWidth - (rect?.width || 0) - 8)),
      bottom: Math.max(8, Math.min(next.bottom, window.innerHeight - (rect?.height || 0) - 8)),
    };
  }

  useEffect(() => {
    // Keep the panel accessible after expanding it or resizing the window.
    const keepVisible = () => setPosition(current => {
      const next = clamp(current);
      return next.right === current.right && next.bottom === current.bottom ? current : next;
    });
    const observer = new ResizeObserver(keepVisible);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", keepVisible);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", keepVisible);
    };
  }, []);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-panel-drag-handle]");
    if (!handle || !event.isPrimary || event.button !== 0) return;
    // Header action buttons keep their normal behavior.
    if (target.closest("button") && target.closest("button") !== handle) return;
    suppressClick.current = false;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, origin: position, moved: false };
    handle.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    event.preventDefault();
    setPosition(clamp({ right: drag.origin.right - dx, bottom: drag.origin.bottom - dy }));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClick.current = drag.moved && event.type !== "pointercancel";
    dragRef.current = null;
    if (event.type === "pointercancel") setPosition(drag.origin);
    const handle = (event.target as HTMLElement).closest<HTMLElement>("[data-panel-drag-handle]");
    if (handle?.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      ref={panelRef}
      className={`fixed z-40 max-w-[calc(100vw-32px)] ${expanded ? "w-[410px]" : "w-max"}`}
      style={position}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onClickCapture={event => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={event => {
        if (!event.altKey || !(event.target as HTMLElement).closest("[data-panel-drag-handle]")) return;
        const movement: Record<string, Position> = {
          ArrowLeft: { right: 16, bottom: 0 }, ArrowRight: { right: -16, bottom: 0 },
          ArrowUp: { right: 0, bottom: 16 }, ArrowDown: { right: 0, bottom: -16 },
        };
        const delta = movement[event.key];
        if (!delta) return;
        event.preventDefault();
        setPosition(current => clamp({ right: current.right + delta.right, bottom: current.bottom + delta.bottom }));
      }}
    >
      {children}
    </div>
  );
}
