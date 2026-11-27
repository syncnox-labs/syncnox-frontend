import { Team } from "@/types/team.type";
import { Checkbox } from "antd";
import DriverPresenceIndicator from "@/components/DriverPresenceIndicator";

interface TeamMemberCardProps {
  team: Team;
  isSelected: boolean;
  isChecked?: boolean;
  onToggleCheck?: (e: React.MouseEvent) => void;
  onClick: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function capitalize(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

const TeamMemberCard = ({
  team,
  isSelected,
  isChecked = false,
  onToggleCheck,
  onClick,
}: TeamMemberCardProps) => {
  // The second line says something a dispatcher can use (role, then the vehicle), not the record number
  const sub = [capitalize(team.role_type), team.vehicle || (team.status === "inactive" ? "Inactive" : "")]
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
      <div className="w-7 h-7 bg-[#E3E8E5] text-[#12211A] flex items-center justify-center text-[10px] font-medium shrink-0 rounded-none">
        {getInitials(team.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-[#12211A] leading-snug flex items-center gap-1.5">
          <span className="truncate">{team.name}</span>
          {team.role_type === "driver" && <DriverPresenceIndicator driverId={team.id} />}
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

export default TeamMemberCard;
