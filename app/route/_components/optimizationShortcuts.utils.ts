export const TIMELINE_INTERVALS = [5, 10, 15, 20, 25, 30, 60] as const;

export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]',
  ));
}

export function hasOpenDialog(doc: Document): boolean {
  return Array.from(doc.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
    .some(dialog => dialog.getClientRects().length > 0);
}

/** Scope browser-find replacement to this mounted optimization screen. */
export function installMapSearchShortcut(container: HTMLElement, open: () => void) {
  const doc = container.ownerDocument;
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey
      || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
    if (hasOpenDialog(doc)) return;
    if (isEditableTarget(event.target) && !container.contains(event.target as Node)) return;
    event.preventDefault();
    open();
  };
  doc.addEventListener("keydown", handleKeyDown);
  return () => doc.removeEventListener("keydown", handleKeyDown);
}

export function nextTimelineInterval(current: number, delta: number): number {
  const index = TIMELINE_INTERVALS.findIndex(interval => interval === current);
  if (index < 0 || !Number.isFinite(delta) || delta === 0) return current;
  return TIMELINE_INTERVALS[Math.max(0, Math.min(TIMELINE_INTERVALS.length - 1, index + Math.sign(delta)))];
}

/** Minute under the pointer, relative to the start of the time axis. */
export function timelineZoomAnchor(scrollLeft: number, offset: number, pixelsPerMinute: number) {
  return { minute: (scrollLeft + offset) / pixelsPerMinute, offset };
}

export function timelineZoomScrollLeft(anchor: { minute: number; offset: number }, pixelsPerMinute: number) {
  return Math.max(0, anchor.minute * pixelsPerMinute - anchor.offset);
}
