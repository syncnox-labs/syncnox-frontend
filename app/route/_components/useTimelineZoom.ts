import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { getPixelsPerMinute } from "@/utils/timeline.utils";
import {
  hasOpenDialog, isEditableTarget, nextTimelineInterval, timelineZoomAnchor, timelineZoomScrollLeft,
} from "./optimizationShortcuts.utils";

/** Shares the dropdown's bounded zoom levels and preserves the pointer's time. */
export function useTimelineZoom(containerRef: RefObject<HTMLDivElement | null>, driverColumnWidth: number, isInteracting: boolean) {
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const intervalRef = useRef(intervalMinutes);
  const anchorRef = useRef<ReturnType<typeof timelineZoomAnchor> | null>(null);
  const skipSelectionScrollRef = useRef(false);

  const changeInterval = useCallback((next: number, pointerOffset?: number) => {
    const container = containerRef.current;
    if (!container || next === intervalRef.current) return;
    const offset = pointerOffset ?? Math.max(0, (container.clientWidth - driverColumnWidth) / 2);
    anchorRef.current = timelineZoomAnchor(container.scrollLeft, offset, getPixelsPerMinute(intervalRef.current));
    skipSelectionScrollRef.current = true;
    setIntervalMinutes(next);
  }, [containerRef, driverColumnWidth]);

  useLayoutEffect(() => {
    intervalRef.current = intervalMinutes;
    const container = containerRef.current;
    if (container && anchorRef.current) {
      // The new axis width is committed before setting scrollLeft; the browser
      // clamps it to the available range and vertical scrolling stays intact.
      container.scrollLeft = timelineZoomScrollLeft(anchorRef.current, getPixelsPerMinute(intervalMinutes));
      anchorRef.current = null;
    }
  }, [containerRef, intervalMinutes]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let accumulatedDelta = 0;
    let lastEventAt = -Infinity;
    let lastZoomAt = -Infinity;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented
        || !event.cancelable || !Number.isFinite(event.deltaY) || event.deltaY === 0
        || isEditableTarget(event.target) || hasOpenDialog(container.ownerDocument)) return;
      const offset = event.clientX - container.getBoundingClientRect().left - driverColumnWidth;
      if (offset < 0 || offset > container.clientWidth - driverColumnWidth) return;
      // A native non-passive listener is needed to cancel browser page zoom.
      // Cancel at the zoom limits too, so continuing a gesture never zooms the page.
      event.preventDefault();
      if (isInteracting) return;
      const now = performance.now();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientHeight : 1);
      if (now - lastEventAt > 180 || Math.sign(delta) !== Math.sign(accumulatedDelta)) accumulatedDelta = 0;
      lastEventAt = now;
      accumulatedDelta += delta;
      // Accumulate high-resolution trackpad movement and limit render frequency.
      if (Math.abs(accumulatedDelta) < 30 || now - lastZoomAt < 100) return;
      const next = nextTimelineInterval(intervalRef.current, accumulatedDelta);
      accumulatedDelta = 0;
      lastZoomAt = now;
      changeInterval(next, offset);
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [changeInterval, containerRef, driverColumnWidth, isInteracting]);

  return { intervalMinutes, changeInterval, skipSelectionScrollRef };
}
