"use client";
import { useState } from "react";
import { message, Tooltip } from "antd";
import {
  ShoppingCart,
  Truck,
  Wrench,
  UtensilsCrossed,
  Package,
  Pill,
  ArrowRight,
  ArrowLeft,
  Info,
  Crown,
  Radio,
  Briefcase,
  FileSpreadsheet,
  MapPin,
  Compass,
  Navigation2,
  HelpCircle,
  Search,
  Users,
  Linkedin,
  Youtube,
  BarChart3,
  Globe,
  LucideIcon,
} from "lucide-react";

import {
  Onboarding,
  ROLE_OPTIONS,
  INDUSTRY_OPTIONS,
  FLEET_SIZE_OPTIONS,
  STOPS_PER_DAY_OPTIONS,
  CURRENT_TOOL_OPTIONS,
  HEARING_SOURCE_OPTIONS,
} from "@/types/onboarding.type";
import { useOnboardingStore } from "@/store/onboarding.store";

const ROLE_ICONS: Record<string, LucideIcon> = {
  owner: Crown,
  dispatcher: Radio,
  ops_manager: Briefcase,
};

const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  e_commerce: ShoppingCart,
  courier_express: Package,
  food_grocery: UtensilsCrossed,
  field_service: Wrench,
  medical_pharmacy: Pill,
  logistics_freight: Truck,
};

const TOOL_ICONS: Record<string, LucideIcon> = {
  spreadsheets: FileSpreadsheet,
  google_maps: MapPin,
  optimoroute: Compass,
  circuit: Navigation2,
  routific: Navigation2,
  nothing_yet: HelpCircle,
};

const HEARING_ICONS: Record<string, LucideIcon> = {
  google: Search,
  referral: Users,
  linkedin: Linkedin,
  youtube: Youtube,
  comparison: BarChart3,
  other: Globe,
};

interface BasicInfoStepProps {
  onNext: () => void;
  onBack: () => void;
}

const BasicInfoStep = ({ onNext, onBack }: BasicInfoStepProps) => {
  const { saveBasicInfoAction, isLoading, onboarding } = useOnboardingStore();
  const [companyName, setCompanyName] = useState(onboarding?.company_name || "");
  const [userRole, setUserRole] = useState<string>(onboarding?.user_role || "");
  const [industry, setIndustry] = useState<string>(onboarding?.industry || "");
  const [fleetSize, setFleetSize] = useState<string>(onboarding?.fleet_size || "");
  const [stopsPerDay, setStopsPerDay] = useState<string>(onboarding?.stops_per_day || "");
  const [currentTool, setCurrentTool] = useState<string>(onboarding?.current_tool || "");
  const [hearingSource, setHearingSource] = useState<string>(onboarding?.hearing_source || "");

  // Required fields: Company name, Role, Industry, Fleet size, Stops per day
  const canContinue =
    companyName.trim().length > 0 &&
    userRole !== "" &&
    industry !== "" &&
    fleetSize !== "" &&
    stopsPerDay !== "";

  // Count filled fields for status badge
  const fieldsCapturedCount = [
    companyName.trim(),
    userRole,
    industry,
    fleetSize,
    stopsPerDay,
    currentTool,
    hearingSource,
  ].filter(Boolean).length;

  const handleContinue = async () => {
    if (!companyName.trim()) {
      message.error("Please enter your company name");
      return;
    }
    if (!userRole) {
      message.error("Please select your role");
      return;
    }
    if (!industry) {
      message.error("Please select your industry");
      return;
    }
    if (!fleetSize) {
      message.error("Please select your fleet size");
      return;
    }
    if (!stopsPerDay) {
      message.error("Please select your stops per day");
      return;
    }

    try {
      await saveBasicInfoAction({
        company_name: companyName.trim(),
        user_role: userRole,
        industry: industry,
        fleet_size: fleetSize,
        stops_per_day: stopsPerDay,
        current_tool: currentTool || null,
        hearing_source: hearingSource || null,
      });
      onNext();
    } catch {
      // Error handled in store
    }
  };

  return (
    <div className="flex flex-col h-dvh p-4 sm:p-6 lg:p-10 w-full mx-auto overflow-hidden bg-white justify-between relative">
      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-6">
        {/* Header section */}
        <div>
          <div className="text-[11px] font-bold tracking-widest uppercase text-[#003220] mb-1">
            Step 1 of 4 · About you
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight leading-snug mb-1 flex items-center gap-2">
            <span>Tell us who you are.</span>
            <Tooltip
              title="We use this to preconfigure the right defaults — and yes, it takes 20 seconds. Just tap."
              placement="right"
              getPopupContainer={() => document.body}
            >
              <Info size={16} className="text-gray-400 hover:text-[#003220] cursor-pointer shrink-0 transition-colors" />
            </Tooltip>
          </h1>
          {/* <p className="text-xs text-gray-500 leading-relaxed">
            We use this to preconfigure the right defaults — and yes, it takes 20 seconds. Just tap.
          </p> */}
        </div>

        {/* Form sections */}
        <div className="space-y-5 max-w-[760px]">
          {/* Company name */}
          <div>
            <label htmlFor="ob-company" className="block text-xs font-semibold text-gray-900 mb-1.5">
              Company name <span className="text-red-600">*</span>
            </label>
            <input
              id="ob-company"
              className="w-full px-3.5 py-2 border border-gray-300 rounded-none text-xs text-gray-900 bg-white focus:outline-none focus:border-[#003220] focus:ring-2 focus:ring-[#ecfdf5] transition-all"
              placeholder="e.g. Citadel"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1.5">
              What&apos;s your role? <span className="text-red-600">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {ROLE_OPTIONS.map((opt) => {
                const IconComp = ROLE_ICONS[opt.value];
                const isSelected = userRole === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-3.5 py-2.5 text-xs font-medium rounded-none border transition-all flex items-center justify-start gap-2.5 cursor-pointer text-left ${
                      isSelected
                        ? "bg-[#003220] text-white border-[#003220] shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220]"
                    }`}
                    onClick={() => setUserRole(opt.value)}
                  >
                    {IconComp && <IconComp size={15} className={isSelected ? "text-white" : "text-[#003220]"} />}
                    <span className="font-semibold truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Industry */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1.5">
              Industry <span className="text-red-600">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {INDUSTRY_OPTIONS.map((opt) => {
                const IconComp = INDUSTRY_ICONS[opt.value];
                const isSelected = industry === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-3.5 py-2.5 text-xs font-medium rounded-none border transition-all flex items-center justify-start gap-2.5 cursor-pointer text-left ${
                      isSelected
                        ? "bg-[#003220] text-white border-[#003220] shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220]"
                    }`}
                    onClick={() => setIndustry(opt.value)}
                  >
                    {IconComp && <IconComp size={15} className={isSelected ? "text-white" : "text-[#003220]"} />}
                    <span className="font-semibold truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fleet size */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1.5">
              Fleet size <span className="text-red-600">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {FLEET_SIZE_OPTIONS.map((opt) => {
                const isSelected = fleetSize === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-3 py-2.5 text-xs font-semibold rounded-none border transition-all text-center cursor-pointer ${
                      isSelected
                        ? "bg-[#003220] text-white border-[#003220] shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220]"
                    }`}
                    onClick={() => setFleetSize(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stops per day */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1.5">
              Stops per day <span className="text-red-600">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {STOPS_PER_DAY_OPTIONS.map((opt) => {
                const isSelected = stopsPerDay === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-3 py-2.5 text-xs font-semibold rounded-none border transition-all text-center cursor-pointer ${
                      isSelected
                        ? "bg-[#003220] text-white border-[#003220] shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220]"
                    }`}
                    onClick={() => setStopsPerDay(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current tool */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1">
              What are you using to plan routes today? <span className="text-gray-400 font-normal">(helps us import)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {CURRENT_TOOL_OPTIONS.map((opt) => {
                const IconComp = TOOL_ICONS[opt.value];
                const isSelected = currentTool === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-3 py-2 text-xs font-medium rounded-none border transition-all flex items-center justify-start gap-2 cursor-pointer text-left ${
                      isSelected
                        ? "bg-[#003220] text-white border-[#003220] shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220]"
                    }`}
                    onClick={() => setCurrentTool(opt.value)}
                  >
                    {IconComp && <IconComp size={14} className={isSelected ? "text-white" : "text-[#003220]"} />}
                    <span className="font-medium truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Hearing source */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1">
              How did you hear about us? <span className="text-gray-400 font-normal">(optional — helps us a lot)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {HEARING_SOURCE_OPTIONS.map((opt) => {
                const IconComp = HEARING_ICONS[opt.value];
                const isSelected = hearingSource === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`px-3 py-2 text-xs font-medium rounded-none border transition-all flex items-center justify-start gap-2 cursor-pointer text-left ${
                      isSelected
                        ? "bg-[#003220] text-white border-[#003220] shadow-sm"
                        : "bg-white text-gray-800 border-gray-200 hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220]"
                    }`}
                    onClick={() => setHearingSource(opt.value)}
                  >
                    {IconComp && <IconComp size={14} className={isSelected ? "text-white" : "text-[#003220]"} />}
                    <span className="font-medium truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Floating fields captured pill at bottom right */}
      {fieldsCapturedCount > 0 && (
        <div className="absolute bottom-16 right-6 z-10 hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#003220] text-white text-[11px] font-semibold rounded-full shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{fieldsCapturedCount} / 7 fields captured</span>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-3 py-3 border-t border-gray-200 mt-3 bg-white shrink-0 rounded-none">
        <button
          className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-900 bg-transparent border-none cursor-pointer rounded-none flex items-center gap-1.5"
          onClick={onBack}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <button
          className="px-5 py-2.5 bg-[#003220] text-white border border-[#003220] rounded-none font-semibold text-xs hover:bg-[#002a00] transition-colors cursor-pointer flex items-center gap-2 disabled:bg-gray-400 disabled:border-gray-400 disabled:cursor-not-allowed"
          onClick={handleContinue}
          disabled={!canContinue || isLoading}
          id="ob-basics-continue"
        >
          {isLoading ? "Saving…" : "Continue"} <ArrowRight size={14} />
        </button>
        <button
          className="ml-auto text-xs font-semibold text-gray-500 hover:text-gray-900 bg-transparent border-none cursor-pointer underline rounded-none"
          onClick={onNext}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};

export default BasicInfoStep;

