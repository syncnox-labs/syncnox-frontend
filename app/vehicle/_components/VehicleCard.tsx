import { Vehicle } from "@/types/vehicle.type";
import { Truck } from "lucide-react";
import { Checkbox } from "antd";

interface VehicleCardProps {
  vehicle: Vehicle;
  isSelected: boolean;
  isChecked?: boolean;
  onToggleCheck?: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function formatType(type: string | null): string {
  if (!type) return "";
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const VehicleCard = ({
  vehicle,
  isSelected,
  isChecked = false,
  onToggleCheck,
  onClick,
}: VehicleCardProps) => {
  const sub = [formatType(vehicle.type), vehicle.license_plate]
    .filter(Boolean)
    .join(" · ");

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
        <Truck size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[#12211A] truncate leading-snug">
          {vehicle.name}
        </div>
        {sub && (
          <div className="text-xs text-[#626E67] truncate leading-snug">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleCard;
