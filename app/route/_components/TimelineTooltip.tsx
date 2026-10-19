import { createContext, useCallback, useContext, useRef } from "react";
import type { ReactNode } from "react";
import { Tooltip } from "antd";
import type { TooltipProps } from "antd";

const PopupContainerContext = createContext<TooltipProps["getPopupContainer"]>(undefined);

/** A fixed viewport layer, outside the timeline's scrolling content. */
export function TimelineTooltipProvider({ children, leftInset, topInset }: {
  children: ReactNode;
  leftInset: number;
  topInset: number;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const getPopupContainer = useCallback((trigger: HTMLElement) =>
    layerRef.current ?? trigger.ownerDocument.body, []);

  return <PopupContainerContext.Provider value={getPopupContainer}>
    <div className="relative h-full min-h-0 min-w-0">
      {children}
      <div ref={layerRef} data-timeline-tooltip-layer="true" style={{
        position: "absolute", left: leftInset, top: topInset, right: 0, bottom: 0,
        overflow: "hidden", containerType: "size", pointerEvents: "none", zIndex: 70,
      }} />
    </div>
  </PopupContainerContext.Provider>;
}

/** Align to the visible timeline viewport, including partially visible long bars. */
export default function TimelineTooltip({ styles, overlayStyle, overlayInnerStyle, align, ...props }: TooltipProps) {
  const getPopupContainer = useContext(PopupContainerContext);
  if (!getPopupContainer) {
    return <Tooltip {...props} styles={styles} overlayStyle={overlayStyle} overlayInnerStyle={overlayInnerStyle} align={align} />;
  }

  return <Tooltip {...props} getPopupContainer={getPopupContainer} autoAdjustOverflow
    // A placement gap can defeat the final edge shift in a short viewport.
    align={{ ...align, offset: [0, 0], htmlRegion: "visible", overflow: {
      ...align?.overflow, adjustX: true, adjustY: true, shiftX: true, shiftY: true,
    } }}
    styles={info => {
      const supplied = typeof styles === "function" ? styles(info) : styles;
      return {
        ...supplied,
        root: { ...overlayStyle, ...supplied?.root, pointerEvents: "auto",
          maxWidth: "min(350px, calc(100cqw - 16px))", maxHeight: "calc(100cqh - 16px)" },
        container: { ...overlayInnerStyle, ...supplied?.container, boxSizing: "border-box",
          maxWidth: "100%", maxHeight: "calc(100cqh - 32px)", overflow: "auto" },
      };
    }}
  />;
}
