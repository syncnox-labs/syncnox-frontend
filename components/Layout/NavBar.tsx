"use client";
import { usePathname } from "next/navigation";
import { getTabsConfigForRoute } from "@/config/navTabs.config";
import { useIndexStore } from "@/store/index.store";

/** Atlassian page header for pages that have views: breadcrumb, page title, then tabs. */
const NavBar = () => {
  const pathname = usePathname();
  const tabs = getTabsConfigForRoute(pathname);
  const { currentTab, setCurrentTab } = useIndexStore();

  // Don't render navbar if no tabs configured for this route
  if (!tabs) {
    return null;
  }

  // Opening the page by its address can leave no tab chosen; the first tab is what is shown then
  const activeKey = tabs.some((tab) => tab.key === currentTab) ? currentTab : tabs[0]?.key;
  const activeLabel = tabs.find((tab) => tab.key === activeKey)?.label;
  const section = pathname.split("/")[1] || "";
  const pageName = section.charAt(0).toUpperCase() + section.slice(1);

  return (
    <div className="kit-fluid flex min-w-0 shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 bg-white px-4 pb-3 pt-3 sm:px-6 sm:pt-4">
      <div className="min-w-0">
        <p className="m-0 text-[11px] font-medium uppercase leading-4 tracking-[0.09em] text-[#626E67]">
          {pageName}
          <span aria-hidden="true" className="mx-1.5 opacity-60">/</span>
          {activeLabel}
        </p>
        <h1 className="kit-title m-0 mt-1 font-medium text-[#12211A]">{pageName}</h1>
      </div>
      {/* The views of this page: plain words on one thin line, with a green line under the view you are on */}
      <nav aria-label={`${pageName} views`} className="max-w-full overflow-x-auto">
        <div className="inline-flex gap-1 shadow-[inset_0_-1px_0_#D5DCD8]">
          {tabs.map((tab) => {
            const isActive = activeKey === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setCurrentTab(tab.key as any)}
                className={`inline-flex h-9 shrink-0 cursor-pointer items-center whitespace-nowrap border-0 bg-transparent px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B5D3B] ${
                  isActive ? "font-medium text-[#12211A] shadow-[inset_0_-2px_0_#0B5D3B]" : "font-normal text-[#4A5750] hover:text-[#12211A] hover:shadow-[inset_0_-2px_0_#9AA8A0]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default NavBar;
