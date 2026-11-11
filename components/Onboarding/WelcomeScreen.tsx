"use client";
import { Tooltip } from "antd";
import { Sparkles, Building2, MapPin, Truck, Rocket, ArrowRight, Info } from "lucide-react";


interface WelcomeScreenProps {
  onStart: () => void;
}

const WelcomeScreen = ({ onStart }: WelcomeScreenProps) => {
  return (
    <div className="flex flex-col h-dvh p-4 sm:p-6 lg:p-10 w-full mx-auto overflow-hidden bg-white animate-fadeIn justify-between">
      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col justify-start max-w-[840px]">
        <div className="text-[11px] font-bold tracking-widest uppercase text-[#003220] mb-2 flex items-center gap-1.5">
          <Sparkles size={13} className="text-[#003220]" /> GET STARTED
        </div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight leading-snug mb-5 flex items-center gap-2">
          <span>Let&apos;s set up your workspace.</span>
          <Tooltip title="Four quick steps to configure your fleet and depots — about 2 minutes. You can skip anything and finish later." placement="right" getPopupContainer={() => document.body}>
            <Info size={16} className="text-gray-400 hover:text-[#003220] cursor-pointer shrink-0 transition-colors" />
          </Tooltip>
        </h1>


        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2 w-full">
          <div className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-none bg-white hover:border-[#003220] transition-colors">
            <div className="w-8 h-8 bg-[#ecfdf5] text-[#003220] border border-[#a7f3d0] flex items-center justify-center font-bold text-xs shrink-0 rounded-none">
              <Building2 size={16} />
            </div>
            <div>
              <b className="block text-xs font-semibold text-gray-900">Tell us about your business</b>
              <span className="text-[11px] text-gray-500">Personalize your setup</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-none bg-white hover:border-[#003220] transition-colors">
            <div className="w-8 h-8 bg-[#ecfdf5] text-[#003220] border border-[#a7f3d0] flex items-center justify-center font-bold text-xs shrink-0 rounded-none">
              <MapPin size={16} />
            </div>
            <div>
              <b className="block text-xs font-semibold text-gray-900">Add your depot(s)</b>
              <span className="text-[11px] text-gray-500">Where routes start &amp; end</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-none bg-white hover:border-[#003220] transition-colors">
            <div className="w-8 h-8 bg-[#ecfdf5] text-[#003220] border border-[#a7f3d0] flex items-center justify-center font-bold text-xs shrink-0 rounded-none">
              <Truck size={16} />
            </div>
            <div>
              <b className="block text-xs font-semibold text-gray-900">Add vehicles &amp; drivers</b>
              <span className="text-[11px] text-gray-500">Your fleet and team</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3.5 border border-gray-200 rounded-none bg-white hover:border-[#003220] transition-colors">
            <div className="w-8 h-8 bg-[#ecfdf5] text-[#003220] border border-[#a7f3d0] flex items-center justify-center font-bold text-xs shrink-0 rounded-none">
              <Rocket size={16} />
            </div>
            <div>
              <b className="block text-xs font-semibold text-gray-900">Start optimizing</b>
              <span className="text-[11px] text-gray-500">Plan and dispatch routes instantly</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 py-3 border-t border-gray-200 mt-3 bg-white shrink-0 rounded-none">
        <button
          className="px-5 py-2.5 bg-[#003220] text-white border border-[#003220] rounded-none font-semibold text-xs hover:bg-[#002a00] transition-colors cursor-pointer flex items-center gap-2"
          onClick={onStart}
          id="ob-welcome-start"
        >
          Let&apos;s go <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};



export default WelcomeScreen;
