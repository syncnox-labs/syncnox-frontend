"use client";
import { useState } from "react";
import { message, Tooltip } from "antd";
import { Plus, FileSpreadsheet, LucideIcon, Info } from "lucide-react";
import { useOnboardingStore } from "@/store/onboarding.store";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";


interface OnboardingListStepProps<T extends { id: number }> {
  stepNumber: number;
  totalSteps?: number;
  progressPercent: number;
  kicker: string;
  title: string;
  subtitle: string;
  items: T[];
  itemLabelSingular: string;
  itemLabelPlural: string;
  entityType?: "vehicle" | "driver";
  Icon: LucideIcon;
  FormComponent: React.ComponentType<{ onSubmit: () => void; isInline?: boolean; showSubmitButton?: boolean }>;

  getItemDisplay: (item: T) => { name: string; secondary?: string };
  onNext: () => void;
  onBack: () => void;
  successMessage: string;
  emptyErrorMessage: string;
}

const OnboardingListStep = <T extends { id: number }>({
  progressPercent,
  kicker,
  title,
  subtitle,
  items,
  itemLabelSingular,
  itemLabelPlural,
  entityType,
  Icon,
  FormComponent,
  getItemDisplay,
  onNext,
  onBack,
  successMessage,
  emptyErrorMessage,
}: OnboardingListStepProps<T>) => {
  const [showForm, setShowForm] = useState(items.length === 0);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const { isLoading } = useOnboardingStore();

  const handleItemAdded = () => {
    setShowForm(false);
    message.success(successMessage);
  };

  const handleContinue = () => {
    if (items.length === 0) {
      message.error(emptyErrorMessage);
      return;
    }
    onNext();
  };

  return (
    <div className="flex flex-col h-dvh p-4 sm:p-6 lg:p-10 w-full mx-auto overflow-hidden bg-white justify-between">
      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {/* Progress */}
        <div className="h-1.5 bg-gray-200 w-full mb-5 rounded-none overflow-hidden">
          <div
            className="h-full bg-[#003220] transition-all duration-400 rounded-none"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="text-[11px] font-bold tracking-widest uppercase text-[#003220] mb-1.5">
          {kicker}
        </div>
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight leading-snug flex items-center gap-2">
            <span>{title}</span>
            {subtitle && (
              <Tooltip title={subtitle} placement="right" getPopupContainer={() => document.body}>
                <Info size={16} className="text-gray-400 hover:text-[#003220] cursor-pointer shrink-0 transition-colors" />
              </Tooltip>
            )}
          </h1>

          {entityType && (
            <button
              className="px-3.5 py-1.5 bg-white text-gray-800 border border-gray-300 rounded-none text-xs font-medium hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220] transition-all cursor-pointer flex items-center gap-2 shrink-0"
              onClick={() => setBulkModalOpen(true)}
            >
              <FileSpreadsheet size={15} />
              Import Excel / CSV
            </button>
          )}
        </div>

        {/* Added items */}
        {items.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] font-bold text-[#003220] uppercase tracking-wider mb-2">
              Added {itemLabelPlural} ({items.length})
            </div>
            {items.map((item) => {
              const display = getItemDisplay(item);
              return (
                <div
                  key={item.id}
                  className="flex justify-between items-center gap-3 bg-[#ecfdf5] border border-[#a7f3d0] rounded-none px-3 py-2 text-sm mb-2"
                >
                  <div className="flex items-center gap-2">
                    <Icon size={14} className="text-[#003220] shrink-0" />
                    <div>
                      <b className="font-semibold text-[#003220]">{display.name}</b>
                      {display.secondary && (
                        <span className="text-xs text-gray-600 ml-1.5">{display.secondary}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Form or Add buttons */}
        {showForm ? (
          <div className="border border-gray-200 rounded-none overflow-hidden bg-white mb-3">
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#ecfdf5] border-b border-[#a7f3d0]">
              <span className="text-xs font-semibold text-[#003220]">
                New{" "}
                {itemLabelSingular.charAt(0).toUpperCase() + itemLabelSingular.slice(1)}
              </span>
              {items.length > 0 && (
                <button
                  onClick={() => setShowForm(false)}
                  className="border-none bg-transparent cursor-pointer text-gray-500 hover:text-gray-900 text-lg leading-none p-1 rounded-none"
                  title="Cancel"
                >
                  ×
                </button>
              )}
            </div>
            <div className="p-4">
              <FormComponent onSubmit={handleItemAdded} isInline showSubmitButton />
            </div>
          </div>
        ) : null}

        {/* Buttons row — Add button */}
        {!showForm && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              className="px-4 py-2 bg-white text-gray-800 border border-gray-300 rounded-none text-xs font-medium hover:border-[#003220] hover:bg-[#ecfdf5] hover:text-[#003220] transition-all cursor-pointer flex items-center gap-2"
              onClick={() => setShowForm(true)}
              id={`ob-add-${itemLabelSingular}`}
            >
              <Plus size={15} />
              Add {items.length > 0 ? "another" : "a"} {itemLabelSingular}
            </button>
          </div>
        )}



      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 py-4 border-t border-gray-200 mt-3 bg-white shrink-0 rounded-none">
        <button
          className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-transparent border-none cursor-pointer rounded-none"
          onClick={onBack}
        >
          ← Back
        </button>
        <button
          className="px-5 py-2.5 bg-[#003220] text-white border border-[#003220] rounded-none font-semibold text-sm hover:bg-[#002a00] transition-colors cursor-pointer flex items-center gap-2 disabled:bg-gray-400 disabled:border-gray-400 disabled:cursor-not-allowed"
          onClick={handleContinue}
          disabled={items.length === 0 || isLoading}
          id={`ob-${itemLabelSingular}-continue`}
        >
          {isLoading ? "Saving…" : "Continue →"}
        </button>
        <button
          className="ml-auto text-xs font-semibold text-gray-500 hover:text-gray-900 bg-transparent border-none cursor-pointer underline rounded-none"
          onClick={onNext}
        >
          Skip for now
        </button>
      </div>

      {entityType && (
        <BulkImportModal
          open={bulkModalOpen}
          onClose={() => setBulkModalOpen(false)}
          entityType={entityType}
          onSuccess={() => {
            setBulkModalOpen(false);
            setShowForm(false);
          }}
          zIndex={10000}
        />
      )}
    </div>
  );
};

export default OnboardingListStep;
