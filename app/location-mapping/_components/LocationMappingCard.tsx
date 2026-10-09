import { LocationMapping, LOCATION_TYPE_OPTIONS } from "@/apis/location-mapping.api";
import { MapPin } from "lucide-react";
import { Checkbox } from "antd";

import { useLocationMappingStore } from "@/store/location-mapping.store";

interface LocationMappingCardProps {
  mapping: LocationMapping;
  isSelected: boolean;
  isChecked?: boolean;
  onToggleCheck?: (e: React.MouseEvent) => void;
  onClick: () => void;
}

const LocationMappingCard = ({
  mapping,
  isSelected,
  isChecked = false,
  onToggleCheck,
  onClick,
}: LocationMappingCardProps) => {
  const { locationTypes } = useLocationMappingStore();
  const sub = [mapping.address, mapping.city].filter(Boolean).join(" · ");
  const rawType = mapping.type || mapping.location_type || "metro_station";
  const allTypes = locationTypes.length > 0 ? locationTypes : LOCATION_TYPE_OPTIONS;
  const matchedOpt = allTypes.find(
    (opt) =>
      opt.value.toLowerCase() === String(rawType).toLowerCase() ||
      opt.label.toLowerCase() === String(rawType).toLowerCase()
  );
  const displayType = matchedOpt
    ? matchedOpt.label
    : String(rawType)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className={`flex items-center gap-2.5 p-2.5 cursor-pointer border transition-all mb-1 bg-white relative rounded-none ${
        isSelected
          ? "bg-emerald-50/80 border-[#003220] shadow-xs"
          : "border-transparent hover:bg-emerald-50/40 hover:border-emerald-200"
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
        className={`w-9 h-9 flex items-center justify-center shrink-0 rounded-none ${
          isSelected ? "bg-[#003220] text-white" : "bg-slate-100 text-[#003220]"
        }`}
      >
        <MapPin size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold text-gray-900 truncate leading-snug">
            {mapping.name}
          </span>
          {displayType && (
            <span className="px-1.5 py-0.2 text-[9.5px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded shrink-0">
              {displayType}
            </span>
          )}
        </div>
        {sub ? (
          <div className="text-[11.5px] text-gray-500 truncate mt-0.5 leading-snug">
            {sub}
          </div>
        ) : (
          <div className="text-[11.5px] text-gray-400 italic truncate mt-0.5 leading-snug">
            No address set
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationMappingCard;
