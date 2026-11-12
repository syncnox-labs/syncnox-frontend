/** Shared Tailwind styles for the planning toolbars. Keep section styles out of globals.css. */
const planToolbarBaseClassName = [
  "responsive-toolbar !mb-0 shrink-0",
  "max-sm:[&_h4]:sr-only!",
  "max-lg:[&_.ant-btn]:px-1.5! max-lg:[&_.ant-btn]:text-[12px]!",
  "max-lg:[&_.ant-btn-icon-only]:px-0!",
  "max-lg:[&_.ant-picker]:max-w-full! max-lg:[&_.ant-picker]:py-1!",
].join(" ");

export const planToolbarClassName = [
  planToolbarBaseClassName,
  "max-lg:[&_.ant-btn]:h-9! max-lg:[&_.ant-btn]:min-h-9!",
  "max-lg:[&_.ant-btn-icon-only]:w-9!",
  "max-lg:[&_.ant-picker]:h-9! max-lg:[&_.ant-picker]:min-h-9!",
  "max-lg:[&_.ant-select-single]:h-9! max-lg:[&_.ant-select-single]:min-h-9!",
  "max-lg:[&_.ant-picker]:w-[154px]",
].join(" ");

export const planActionsClassName = "max-lg:gap-1.5!";

export const jobsToolbarClassName = [
  planToolbarClassName,
  "max-sm:flex-nowrap! max-sm:gap-1!",
  "max-sm:[&_.ant-picker]:w-full! max-sm:[&_.ant-picker]:min-w-0! max-sm:[&_.ant-picker]:px-1!",
  "max-sm:[&_.ant-picker_input]:text-[12px]! max-sm:[&_.ant-picker-suffix]:ms-1!",
  "max-sm:[&_.ant-btn]:gap-0.5! max-sm:[&_.ant-btn]:px-0.5!",
  "max-sm:[&_.ant-btn:not(.ant-btn-icon-only)]:px-1.5!",
  "max-sm:[&_.ant-btn_.inline-flex]:gap-0.5! max-sm:[&_.ant-btn-icon-only]:w-[26px]!",
  "max-[360px]:[&_.ant-btn]:text-[11px]! max-[360px]:[&_.ant-picker_input]:text-[11px]!",
  "max-[360px]:[&_.ant-btn-icon-only]:w-6!",
].join(" ");

export const jobsDateGroupClassName = [
  "max-sm:flex-[0_1_124px]! max-sm:min-w-[116px]! max-sm:flex-nowrap! max-sm:gap-0!",
  "max-[360px]:basis-[116px]! max-[360px]:min-w-[108px]!",
].join(" ");

export const jobsActionsClassName = `${planActionsClassName} max-sm:flex-[0_0_auto]! max-sm:flex-nowrap! max-sm:gap-0.5!`;

export const scheduleToolbarClassName = [
  planToolbarBaseClassName,
  "sm:max-lg:gap-y-1.5!",
  "max-lg:[&_.ant-btn]:h-8! max-lg:[&_.ant-btn]:min-h-8! max-lg:[&_.ant-btn-icon-only]:w-8!",
  "max-lg:[&_.ant-select-single]:h-8! max-lg:[&_.ant-select-single]:min-h-8! max-lg:[&_.ant-select-single]:w-20!",
  "max-lg:[&_.ant-select-content]:text-[12px]! max-lg:[&_.ant-select-selection-item]:text-[12px]!",
  "max-lg:[&_.ant-picker]:h-8! max-lg:[&_.ant-picker]:min-h-8! max-lg:[&_.ant-picker]:w-[136px]!",
  "max-lg:[&_.ant-picker_input]:text-[12px]!",
].join(" ");
export const scheduleTitleClassName = "m-0 pt-2 sm:max-lg:m-0! sm:max-lg:pt-0!";
