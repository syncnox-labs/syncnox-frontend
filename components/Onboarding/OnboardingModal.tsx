"use client";
import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { useOnboardingStore } from "@/store/onboarding.store";
import WelcomeScreen from "./WelcomeScreen";
import BasicInfoStep from "./BasicInfoStep";
import DepotStep from "./DepotStep";
import FleetStep from "./FleetStep";
import TeamStep from "./TeamStep";
import CompletionScreen from "./CompletionScreen";

// Check mark for completed steps
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
  </svg>
);

interface RailStep {
  key: string;
  label: string;
  sub: string;
  dot: string | React.ReactNode;
}

const RAIL_STEPS: RailStep[] = [
  { key: "welcome", label: "Welcome", sub: "Get started", dot: "0" },
  { key: "about", label: "Basics", sub: "Your business", dot: "1" },
  { key: "depot", label: "Depot", sub: "Where routes start", dot: "2" },
  { key: "fleet", label: "Fleet", sub: "Vehicles", dot: "3" },
  { key: "team", label: "Team", sub: "Drivers", dot: "4" },
  { key: "done", label: "All set", sub: "See it work", dot: "✓" },
];


const STEP_KEYS = ["welcome", "about", "depot", "fleet", "team", "done"];

const OnboardingModal = () => {
  const {
    onboarding,
    advanceStepAction,
    completeOnboardingAction,
    setShowCompletion,
    showCompletion,
  } = useOnboardingStore();


  const [currentStep, setCurrentStep] = useState(onboarding?.current_step ?? 0);
  const [isOpen, setIsOpen] = useState(true);
  const isAdvancingRef = useRef(false);
  useEffect(() => {
    if (onboarding && !onboarding.is_completed) {
      setIsOpen(true);
      setCurrentStep(onboarding.current_step);
    }
  }, [onboarding?.current_step, onboarding?.is_completed]);



  const handleStart = useCallback(async () => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    setCurrentStep(1);
    try {
      await advanceStepAction(1);
    } catch (error) {
      console.error("Failed to advance onboarding step:", error);
    } finally {
      isAdvancingRef.current = false;
    }
  }, [advanceStepAction]);


  const handleBasicInfoNext = useCallback(() => {
    setCurrentStep(2);
  }, []);

  const handleDepotNext = useCallback(async () => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    setCurrentStep(3);
    try {
      await advanceStepAction(3);
    } catch (error) {
      console.error("Failed to advance onboarding step:", error);
    } finally {
      isAdvancingRef.current = false;
    }
  }, [advanceStepAction]);

  const handleFleetNext = useCallback(async () => {
    if (isAdvancingRef.current) return;
    isAdvancingRef.current = true;
    setCurrentStep(4);
    try {
      await advanceStepAction(4);
    } catch (error) {
      console.error("Failed to advance onboarding step:", error);
    } finally {
      isAdvancingRef.current = false;
    }
  }, [advanceStepAction]);

  const handleTeamNext = useCallback(() => {
    setShowCompletion(true);
    setCurrentStep(5);
  }, [setShowCompletion]);


  const handleCompleteOnboarding = useCallback(async () => {
    try {
      await completeOnboardingAction();
      setIsOpen(false);
      setShowCompletion(false);
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
    }
  }, [completeOnboardingAction, setShowCompletion]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleBack = useCallback((toStep: number) => {
    setCurrentStep(toStep);
  }, []);

  if (!onboarding || onboarding.is_completed || !isOpen) {
    return null;
  }

  const activeKey = STEP_KEYS[currentStep] ?? "welcome";

  const getStepState = (key: string) => {
    const activeIdx = STEP_KEYS.indexOf(activeKey);
    const stepIdx = STEP_KEYS.indexOf(key);
    if (stepIdx < activeIdx) return "done";
    if (stepIdx === activeIdx) return "active";
    return "muted";
  };

  const renderContent = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeScreen onStart={handleStart} />;
      case 1:
        return <BasicInfoStep onNext={handleBasicInfoNext} onBack={() => handleBack(0)} />;
      case 2:
        return <DepotStep onNext={handleDepotNext} onBack={() => handleBack(1)} />;
      case 3:
        return <FleetStep onNext={handleFleetNext} onBack={() => handleBack(2)} />;
      case 4:
        return <TeamStep onNext={handleTeamNext} onBack={() => handleBack(3)} />;
      case 5:
        return <CompletionScreen onClose={handleCompleteOnboarding} />;
      default:
        return <WelcomeScreen onStart={handleStart} />;
    }
  };


  return (
    <div className="fixed inset-0 z-[9999] bg-white grid grid-cols-1 md:grid-cols-[280px_1fr] overflow-hidden rounded-none font-sans" role="dialog" aria-modal="true" aria-label="Syncnox setup wizard">
      {/* ── Left rail ─────────────────────────────────────── */}
      <aside className="hidden md:flex bg-[#003220] text-white p-8 flex-col gap-6 h-dvh overflow-hidden border-r border-[#002a00] rounded-none">
        {/* Brand */}
        <div className="flex items-center gap-2.5 font-bold text-lg tracking-tight text-white">
          <Image
            src="/logo.svg"
            alt="Syncnox"
            width={28}
            height={28}
            className="brightness-0 invert"
          />
          <span className="font-bold text-lg tracking-tight">Syncnox</span>
        </div>

        {/* Steps */}
        <div>
          <div className="text-[11px] text-[#6eb46e] font-bold tracking-wider uppercase mt-1">Getting started</div>
          <div className="flex flex-col gap-1 mt-2">
            {RAIL_STEPS.map((s) => {
              const state = getStepState(s.key);
              const isDone = state === "done";
              const isActive = state === "active";
              const isMuted = state === "muted";

              return (
                <div
                  key={s.key}
                  className={`flex gap-3 items-start p-2.5 rounded-none transition-colors ${
                    isActive ? "bg-white/10" : isMuted ? "opacity-50" : ""
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-none border text-xs font-bold flex items-center justify-center shrink-0 transition-all ${
                      isActive
                        ? "bg-[#6eb46e] border-[#6eb46e] text-[#002a00]"
                        : isDone
                        ? "bg-white border-white text-[#003220]"
                        : "border-white/40 text-white bg-transparent"
                    }`}
                  >
                    {isDone ? <CheckIcon /> : s.dot}
                  </div>
                  <div>
                    <b className="block text-xs font-semibold text-white leading-tight">{s.label}</b>
                    <span className="text-[11px] text-[#a7f3d0]">{s.sub}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto text-xs text-[#a7f3d0] leading-relaxed">
          <span className="inline-flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-none text-white font-semibold mb-2 text-xs border border-white/15">
            ⏱ About 2 minutes
          </span>
          <br />
          {/* You can skip any step and finish later. */}
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────── */}
      <main className="relative min-w-0 min-h-0 flex flex-col overflow-hidden bg-white">
        {renderContent()}
      </main>
    </div>
  );
};

export default OnboardingModal;
