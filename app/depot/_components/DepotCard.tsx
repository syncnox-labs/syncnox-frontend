import { Depot } from "@/types/depots.type";
import { MapPin } from "lucide-react";
import { Checkbox } from "antd";

interface DepotCardProps {
  depot: Depot;
  isSelected: boolean;
  isChecked?: boolean;
  onToggleCheck?: (e: React.MouseEvent) => void;
  onClick: () => void;
}

const DepotCard = ({
  depot,
  isSelected,
  isChecked = false,
  onToggleCheck,
  onClick,
}: DepotCardProps) => {
  const address = depot.address?.formatted_address ?? "";

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-[#E3E8E5] transition-colors relative ${
        isSelected ? "bg-white shadow-[inset_2px_0_0_#0B5D3B]" : "bg-transparent hover:bg-[#EAEFEC]"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-pressed={isSelected}
    >
      {onToggleCheck && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheck(e);
          }}
          className="shrink-0 flex items-center justify-center mr-0.5"
        >
          <Checkbox checked={isChecked} />
        </div>
      )}
      <div
        className={`w-6 flex items-center justify-center shrink-0 ${
          isSelected ? "text-[#12211A]" : "text-[#626E67]"
        }`}
      >
        <MapPin size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[#12211A] truncate leading-snug">
          {depot.name}
        </div>
        {address && (
          <div className="text-xs text-[#626E67] truncate leading-snug">
            {address}
          </div>
        )}
      </div>
    </div>
  );
};

export default DepotCard;
