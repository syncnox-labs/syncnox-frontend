"use client";
import { usePathname } from "next/navigation";
import { getTabsConfigForRoute } from "@/config/navTabs.config";
import { useIndexStore } from "@/store/index.store";

const NavBar = () => {
  const pathname = usePathname();
  const tabs = getTabsConfigForRoute(pathname);
  const { currentTab, setCurrentTab } = useIndexStore();

  // Don't render navbar if no tabs configured for this route
  if (!tabs) {
    return null;
  }

  return (
    <nav className="bg-white border-b border-gray-200 px-3 sm:px-6 min-w-0 shrink-0 overflow-x-auto">
      <div className="flex items-center gap-8 h-14 w-max min-w-full">
        {/* Tabs */}
        <div className="flex items-center gap-6">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.key;
            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setCurrentTab(tab.key as any)}
                className={`flex cursor-pointer items-center gap-2 px-1 h-14 shrink-0 whitespace-nowrap border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                {Icon && <Icon className="text-base" />}
                <span className="text-sm">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
