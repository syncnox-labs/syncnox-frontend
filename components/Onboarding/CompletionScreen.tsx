"use client";
import { Tooltip } from "antd";
import { Users, Truck, MapPin, CheckCircle2, ArrowRight, ShieldCheck, Zap, Info } from "lucide-react";

import { useVehicleStore } from "@/store/vehicle.store";
import { useTeamStore } from "@/store/team.store";
import { useDepotStore } from "@/store/depots.store";
import { useOnboardingStore } from "@/store/onboarding.store";

interface CompletionScreenProps {
  onClose: () => void;
}

const CompletionScreen = ({ onClose }: CompletionScreenProps) => {
  const { vehicles } = useVehicleStore();
  const { teams } = useTeamStore();
  const { depots } = useDepotStore();
  const { isLoading } = useOnboardingStore();

  return (
    <div className="flex flex-col h-dvh p-4 sm:p-6 lg:p-10 w-full mx-auto overflow-hidden bg-white justify-between">
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col items-start justify-start max-w-[840px]">
        {/* Success badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 text-[#003220] text-xs font-semibold mb-4 rounded-none">
          <CheckCircle2 size={15} className="text-emerald-600" />
          <span>SETUP COMPLETE</span>
        </div>

        {/* Title */}
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight leading-snug mb-5 flex items-center gap-2">
          <span>Your workspace is ready for dispatch.</span>
          <Tooltip title="Syncnox has pre-configured your fleet, team, and main depot. You can now start optimizing routes, assigning orders, and dispatching." placement="right" getPopupContainer={() => document.body}>
            <Info size={16} className="text-gray-400 hover:text-[#003220] cursor-pointer shrink-0 transition-colors" />
          </Tooltip>
        </h1>


        {/* Meaningful Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 w-full">
          <div className="bg-white border border-gray-200 p-3.5 text-left rounded-none hover:border-[#003220] transition-colors">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Depots</span>
              <MapPin size={16} className="text-[#003220]" />
            </div>
            <div className="text-xl font-bold text-gray-900">{depots.length || 1}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Configured</div>
          </div>

          <div className="bg-white border border-gray-200 p-3.5 text-left rounded-none hover:border-[#003220] transition-colors">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Vehicles</span>
              <Truck size={16} className="text-[#003220]" />
            </div>
            <div className="text-xl font-bold text-gray-900">{vehicles.length}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">In Fleet</div>
          </div>

          <div className="bg-white border border-gray-200 p-3.5 text-left rounded-none hover:border-[#003220] transition-colors">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Drivers</span>
              <Users size={16} className="text-[#003220]" />
            </div>
            <div className="text-xl font-bold text-gray-900">{teams.length}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Active</div>
          </div>

          <div className="bg-white border border-gray-200 p-3.5 text-left rounded-none hover:border-[#003220] transition-colors">
            <div className="flex items-center justify-between text-gray-400 mb-2">
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Engine</span>
              <Zap size={16} className="text-emerald-600" />
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-700">Online</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Ready to optimize</div>
          </div>
        </div>

        {/* Readiness Checklist */}
        <div className="bg-emerald-50/40 border border-emerald-100 p-4 w-full rounded-none">
          <div className="text-xs font-bold text-[#003220] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <ShieldCheck size={15} /> Workspace Readiness
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
              <span>Business parameters &amp; defaults set</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
              <span>Main depot starting location registered</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
              <span>Fleet vehicle constraints configured</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
              <span>Driver schedules &amp; shift times ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 py-3 border-t border-gray-200 mt-3 bg-white shrink-0 rounded-none">
        <button
          className="px-5 py-2.5 bg-[#003220] text-white border border-[#003220] rounded-none font-semibold text-xs hover:bg-[#002a00] transition-colors cursor-pointer flex items-center gap-2 disabled:bg-gray-400 disabled:border-gray-400 disabled:cursor-not-allowed"
          onClick={onClose}
          disabled={isLoading}
          id="ob-go-to-dashboard"
        >
          {isLoading ? "Saving…" : "Go to dashboard"} <ArrowRight size={14} />
        </button>
        {/* <span className="ml-auto text-xs text-gray-500 flex items-center gap-1">
          ✓ All settings synchronized with backend
        </span> */}
      </div>
    </div>
  );
};

export default CompletionScreen;


