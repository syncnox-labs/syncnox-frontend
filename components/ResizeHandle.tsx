import { GripHorizontal, GripVertical } from "lucide-react";
import { PanelResizeHandle } from "react-resizable-panels";

/** "horizontal" separates panels stacked top and bottom; "vertical" separates side-by-side panels. */
const ResizeHandle = ({ direction = "horizontal" }: { direction?: "horizontal" | "vertical" }) => {
  const vertical = direction === "vertical";
  return (
    <PanelResizeHandle className={`relative shrink-0 touch-none bg-[#D5DCD8] hover:bg-[#0B5D3B] transition-colors flex items-center justify-center group ${
      vertical ? "w-3 sm:w-1 cursor-ew-resize" : "h-3 sm:h-1 cursor-ns-resize"}`}>
      <div className="absolute flex items-center justify-center">
        {vertical
          ? <GripVertical size={20} className="text-[#626E67] group-hover:text-black transition-colors" />
          : <GripHorizontal size={20} className="text-[#626E67] group-hover:text-black transition-colors" />}
      </div>
    </PanelResizeHandle>
  );
};

export default ResizeHandle;
