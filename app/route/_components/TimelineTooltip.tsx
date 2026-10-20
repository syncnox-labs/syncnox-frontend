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
type TimelineTooltipProps = TooltipProps & { popupScope?: "timeline" | "viewport" };

export default function TimelineTooltip({ styles, overlayStyle, overlayInnerStyle, align, popupScope = "timeline", ...props }: TimelineTooltipProps) {
  const getPopupContainer = useContext(PopupContainerContext);
  const inTimeline = popupScope === "timeline";
  if (inTimeline && !getPopupContainer) {
    return <Tooltip {...props} styles={styles} overlayStyle={overlayStyle} overlayInnerStyle={overlayInnerStyle} align={align} />;
  }

  return <Tooltip {...props}
    getPopupContainer={inTimeline ? getPopupContainer : trigger => trigger.ownerDocument.body}
    placement={props.placement ?? (inTimeline ? undefined : "top")}
    zIndex={props.zIndex ?? (inTimeline ? undefined : 1000)} autoAdjustOverflow
    // A placement gap can defeat the final edge shift in a short viewport.
    align={{ ...align, offset: [0, 0], htmlRegion: "visible", overflow: {
      ...align?.overflow, adjustX: true, adjustY: true, shiftX: true, shiftY: true,
    } }}
    styles={info => {
      const supplied = typeof styles === "function" ? styles(info) : styles;
      return {
        ...supplied,
        root: { ...overlayStyle, ...supplied?.root, pointerEvents: "auto",
          maxWidth: inTimeline ? "min(350px, calc(100cqw - 16px))" : "min(400px, calc(100vw - 16px))",
          maxHeight: inTimeline ? "calc(100cqh - 16px)" : "calc(100dvh - 16px)" },
        container: { ...overlayInnerStyle, ...supplied?.container, boxSizing: "border-box",
          maxWidth: "100%",
          maxHeight: inTimeline ? "calc(100cqh - 32px)" : "calc(100dvh - 32px)", overflow: "auto" },
      };
    }}
  />;
}
