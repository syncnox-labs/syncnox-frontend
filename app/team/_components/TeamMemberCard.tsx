import { Team } from "@/types/team.type";
import { Checkbox } from "antd";

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

const statusBgMap: Record<string, string> = {
  active: "bg-green-500",
  inactive: "bg-red-500",
  online: "bg-blue-500",
  offline: "bg-gray-400",
};

const TeamMemberCard = ({
  team,
  isSelected,
  isChecked = false,
  onToggleCheck,
  onClick,
}: TeamMemberCardProps) => {
  const sub = [capitalize(team.role_type), `ID ${team.id}`]
    .filter(Boolean)
    .join(" · ");

  const statusDotClass = statusBgMap[team.status] || "bg-gray-400";

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
      <div className="w-9 h-9 bg-[#003220] text-white flex items-center justify-center text-xs font-bold shrink-0 tracking-wide rounded-none">
        {getInitials(team.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-gray-900 truncate leading-snug">
          {team.name}
        </div>
        {sub && (
          <div className="text-[11.5px] text-gray-500 truncate mt-0.5 leading-snug">
            {sub}
          </div>
        )}
      </div>
      <span
        className={`w-2 h-2 shrink-0 ml-auto ${statusDotClass}`}
        title={team.status}
      />
    </div>
  );
};

export default TeamMemberCard;
