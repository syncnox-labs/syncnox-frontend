"use client";
import Link from "next/link";
import { useState, useCallback } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Modal, Popover, Tooltip } from "antd";
import {
  LogoutOutlined,
  MailOutlined,
  TeamOutlined,
  CarOutlined,
  EnvironmentOutlined,
  UserOutlined,
  SettingOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TabKey, useIndexStore } from "@/store/index.store";
import { useOnboardingStore } from "@/store/onboarding.store";
import { useTeamStore } from "@/store/team.store";
import { useVehicleStore } from "@/store/vehicle.store";
import { useDepotStore } from "@/store/depots.store";
import { signOut } from "next-auth/react";
import { MENU_ITEMS } from "./sidebar.constants";

const getInitials = (name: string) => {
  if (!name) return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

const SideBar = ({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) => {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    clearUser,
    setCurrentTab,
    setSidebarNavigation,
    sidebarCollapsed: desktopCollapsed,
    toggleSidebar,
  } = useIndexStore();
  const sidebarCollapsed = mobile ? false : desktopCollapsed;
  const { onboarding } = useOnboardingStore();
  const { teams } = useTeamStore();
  const { vehicles } = useVehicleStore();
  const { depots } = useDepotStore();

  const hasCompanyName = Boolean(onboarding?.company_name?.trim());
  const businessName = onboarding?.company_name || "Admin";
  const initials = hasCompanyName ? getInitials(onboarding?.company_name || "") : "";

  const isActive = useCallback(
    (path: string) =>
      pathname === path || (path === "/plan" && pathname.startsWith("/route")),
    [pathname]
  );

  const hasActiveSubItem = useCallback(
    (subItems?: { path: string }[]) => {
      return subItems?.some((sub) => pathname === sub.path) ?? false;
    },
    [pathname]
  );

  const handleNavigation = useCallback(
    (path: string, tabKey: TabKey) => {
      if (pathname === path) {
        setCurrentTab(tabKey);
      } else {
        setSidebarNavigation(true);
      }
      onNavigate?.();
    },
    [pathname, setCurrentTab, setSidebarNavigation, onNavigate]
  );

  const handleLogout = useCallback(() => {
    Modal.confirm({
      title: "Log out",
      content: "Are you sure you want to log out?",
      okText: "Log out",
      cancelText: "Cancel",
      okButtonProps: { danger: true, type: "primary" },
      icon: <LogoutOutlined className="text-red-500 text-lg" />,
      centered: true,
      onOk: async () => {
        clearUser();
        await signOut({ callbackUrl: "/sign-in" });
      },
    });
  }, [clearUser]);

  const [showStatsInPopover, setShowStatsInPopover] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsedSettingsOpen, setCollapsedSettingsOpen] = useState(false);

  const handleToggleSidebar = useCallback(() => {
    toggleSidebar();
    setCollapsedSettingsOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 220);
  }, [toggleSidebar]);

  const userPopoverContent = (
    <div className="w-[260px] p-3 font-sans space-y-3">
      {/* Centered Avatar & Identity */}
      <div className="flex flex-col items-center pt-1">
        <Avatar
          size={52}
          style={{ backgroundColor: "#003220", color: "#ffffff" }}
          className="font-bold text-sm shadow-md border-2 border-white flex items-center justify-center rounded-none"
          icon={!hasCompanyName ? <UserOutlined /> : undefined}
        >
          {hasCompanyName ? initials : null}
        </Avatar>
        <h3
          className="text-sm font-bold text-gray-900 leading-tight mb-0.5 text-center truncate max-w-full px-2 mt-2"
          title={businessName}
        >
          {businessName}
        </h3>
        {user?.email && (
          <p
            className="text-[11px] text-gray-500 flex items-center justify-center gap-1.5 truncate max-w-full px-2"
            title={user.email}
          >
            <MailOutlined className="text-[10px] text-gray-400 shrink-0" />
            <span className="truncate">{user.email}</span>
          </p>
        )}
      </div>

      {/* Settings Action Button */}
      <div className="pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={() => setShowStatsInPopover((prev) => !prev)}
          className="w-full flex items-center justify-between text-xs px-3 py-2 bg-gray-50 rounded border border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 transition-all cursor-pointer font-semibold text-gray-700 hover:text-[#003220]"
        >
          <div className="flex items-center gap-2">
            <SettingOutlined className="text-sm text-center text-gray-500" />
            <span>Settings</span>
          </div>
          <span className="text-[10px] text-gray-400">
            {showStatsInPopover ? "▲" : "▼"}
          </span>
        </button>
      </div>

      {/* Stats List (collapsible under Settings) */}
      {showStatsInPopover && (
        <div className="space-y-1.5 pt-1">
          <button
            type="button"
            onClick={() => {
              handleNavigation("/team", "team");
              router.push("/team");
            }}
            className="w-full flex items-center justify-between text-xs px-2.5 py-2 bg-white rounded-none border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all cursor-pointer text-left group"
          >
            <div className="flex items-center gap-2 text-gray-700 group-hover:text-[#003220] font-medium">
              <div className="w-5 h-5 rounded-none bg-emerald-100/80 group-hover:bg-[#003220] group-hover:text-white flex items-center justify-center text-[#003220] text-xs shrink-0 transition-colors">
                <TeamOutlined />
              </div>
              <span>Team Members</span>
            </div>
            <span className="bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-[#003220] border border-emerald-200 rounded-none">
              {teams.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigation("/vehicle", "vehicle");
              router.push("/vehicle");
            }}
            className="w-full flex items-center justify-between text-xs px-2.5 py-2 bg-white rounded-none border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all cursor-pointer text-left group"
          >
            <div className="flex items-center gap-2 text-gray-700 group-hover:text-[#003220] font-medium">
              <div className="w-5 h-5 rounded-none bg-emerald-100/80 group-hover:bg-[#003220] group-hover:text-white flex items-center justify-center text-[#003220] text-xs shrink-0 transition-colors">
                <CarOutlined />
              </div>
              <span>Vehicles</span>
            </div>
            <span className="bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-[#003220] border border-emerald-200 rounded-none">
              {vehicles.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigation("/locations", "location");
              router.push("/locations");
            }}
            className="w-full flex items-center justify-between text-xs px-2.5 py-2 bg-white rounded-none border border-gray-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all cursor-pointer text-left group"
          >
            <div className="flex items-center gap-2 text-gray-700 group-hover:text-[#003220] font-medium">
              <div className="w-5 h-5 rounded-none bg-emerald-100/80 group-hover:bg-[#003220] group-hover:text-white flex items-center justify-center text-[#003220] text-xs shrink-0 transition-colors">
                <EnvironmentOutlined />
              </div>
              <span>Locations</span>
            </div>
            <span className="bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-[#003220] border border-emerald-200 rounded-none">
              {depots.length}
            </span>
          </button>
        </div>
      )}
    </div>
  );

  const getMenuItemClasses = (path: string, hasActiveSub = false) => {
    const active = isActive(path);
    if (active) {
      return "w-full flex items-center py-2 px-3 rounded-none transition-all duration-200 cursor-pointer bg-primary text-white";
    }
    if (hasActiveSub) {
      return "w-full flex items-center py-2 px-3 rounded-none transition-all duration-200 cursor-pointer bg-gray-100 text-gray-700 font-medium";
    }
    return "w-full flex items-center py-2 px-3 rounded-none transition-all duration-200 cursor-pointer hover:bg-emerald-50 text-gray-700";
  };

  return (
    <aside
      aria-label={mobile ? "Mobile navigation" : "Sidebar"}
      className={`relative z-20 bg-white flex flex-col border-r shrink-0 transition-[width] duration-200 ease-in-out ${
        mobile ? "h-full w-full [&_nav_button]:min-h-11 [&_nav_a>div]:min-h-11 [&_footer_button]:min-h-11" : `h-dvh ${sidebarCollapsed ? "w-14" : "w-48"}`
      }`}
    >
      {!mobile && (
        <Tooltip title={sidebarCollapsed ? "Open sidebar" : "Close sidebar"} placement="right" mouseEnterDelay={0.15}>
          <button
            type="button"
            onClick={handleToggleSidebar}
            aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            aria-expanded={!sidebarCollapsed}
            className="absolute -right-3 top-4 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-emerald-50 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors cursor-pointer"
          >
            {sidebarCollapsed ? <ChevronRight size={14} strokeWidth={2} /> : <ChevronLeft size={14} strokeWidth={2} />}
          </button>
        </Tooltip>
      )}

      {/* Logo Section */}
      {!mobile && (sidebarCollapsed ? (
        <div className="h-14 px-2 mb-2 flex items-center justify-center shrink-0">
          <Link
            href="/dashboard"
            onClick={() => handleNavigation("/dashboard", "dashboard")}
            aria-label="Syncnox dashboard"
            className="w-10 h-10 flex items-center justify-center hover:bg-emerald-50 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Image
              src="/logo.svg"
              alt="SYNCNOX"
              width={22}
              height={22}
              priority
            />
          </Link>
        </div>
      ) : (
        <div className="h-14 px-3 mb-2 flex items-center justify-between shrink-0">
          <Link
            href="/dashboard"
            onClick={() => handleNavigation("/dashboard", "dashboard")}
            className="flex items-center min-w-0"
          >
            <div className="flex items-center cursor-pointer">
              <Image
                src="/syncnox.svg"
                alt="SYNCNOX"
                width={116}
                height={32}
                className="h-7 w-auto object-contain"
                priority
              />
            </div>
          </Link>
        </div>
      ))}

      {/* Main Menu Items */}
      <nav
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${
          mobile ? "px-2 pt-3" : sidebarCollapsed ? "px-1.5" : "px-2"
        }`}
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#E5E7EB transparent",
        }}
      >
        {MENU_ITEMS.map((item) => {
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const activeSub = hasActiveSubItem(item.subItems);
          const active = isActive(item.path) || activeSub;
          const Icon = item.icon;

          if (sidebarCollapsed) {
            return (
              <div key={item.path} className="mb-1 flex justify-center">
                {hasSubItems ? (
                  <Popover
                    placement="rightTop"
                    trigger="click"
                    arrow={false}
                    open={
                      item.label === "Settings" ? collapsedSettingsOpen : undefined
                    }
                    onOpenChange={
                      item.label === "Settings"
                        ? setCollapsedSettingsOpen
                        : undefined
                    }
                    styles={{
                      container: { padding: 6, borderRadius: 0, minWidth: 185 },
                    }}
                    content={
                      <div className="flex flex-col gap-0.5">
                        <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
                          {item.label}
                        </div>
                        {item.subItems!.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const subActive = isActive(subItem.path);
                          return (
                            <Link
                              key={subItem.path}
                              href={subItem.path}
                              onClick={() => {
                                handleNavigation(subItem.path, subItem.tabKey);
                                setCollapsedSettingsOpen(false);
                              }}
                            >
                              <div
                                className={`flex items-center py-1.5 px-2.5 text-xs rounded-none cursor-pointer transition-colors ${
                                  subActive
                                    ? "bg-primary text-white font-medium"
                                    : "hover:bg-emerald-50 text-gray-700"
                                }`}
                              >
                                <SubIcon
                                  className={`mr-2 text-xs shrink-0 ${
                                    subActive ? "text-white" : "text-gray-500"
                                  }`}
                                />
                                <span className="truncate">{subItem.label}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    }
                  >
                    <button
                      type="button"
                      aria-label={item.label}
                      aria-expanded={
                        item.label === "Settings" ? collapsedSettingsOpen : undefined
                      }
                      className={`w-10 h-10 flex items-center justify-center rounded-none transition-all duration-200 cursor-pointer ${
                        activeSub
                          ? "bg-gray-100 text-primary font-medium"
                          : "text-gray-700 hover:bg-emerald-50 hover:text-primary"
                      }`}
                    >
                      <Icon
                        className={`text-base ${
                          active ? "text-primary" : "text-gray-700"
                        }`}
                      />
                    </button>
                  </Popover>
                ) : (
                  <Tooltip
                    title={item.label}
                    placement="right"
                    mouseEnterDelay={0.1}
                  >
                    <Link
                      href={item.path}
                      onClick={() => handleNavigation(item.path, item.tabKey)}
                    >
                      <button
                        type="button"
                        aria-label={item.label}
                        className={`w-10 h-10 flex items-center justify-center rounded-none transition-all duration-200 cursor-pointer ${
                          active
                            ? "bg-primary text-white"
                            : "text-gray-700 hover:bg-emerald-50 hover:text-primary"
                        }`}
                      >
                        <Icon
                          className={`text-base ${
                            active ? "text-white" : "text-gray-700"
                          }`}
                        />
                      </button>
                    </Link>
                  </Tooltip>
                )}
              </div>
            );
          }

          return (
            <div key={item.path} className="mb-1">
              {hasSubItems ? (
                item.label === "Settings" ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={settingsOpen}
                      className={getMenuItemClasses(item.path, activeSub)}
                      onClick={() => setSettingsOpen(!settingsOpen)}
                    >
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <Icon
                          className={`text-base ${
                            active ? "text-primary" : "text-gray-700"
                          }`}
                        />
                      </div>
                      <span className="ml-2.5 text-sm font-medium whitespace-nowrap overflow-hidden">
                        {item.label}
                      </span>
                      <DownOutlined
                        className={`ml-auto transition-transform ${
                          settingsOpen ? "rotate-180" : ""
                        }`}
                        style={{ fontSize: 12 }}
                      />
                    </button>
                    {settingsOpen && (
                      <div className="mt-1 mb-1 space-y-0.5">
                        {item.subItems!.map((subItem) => {
                          const SubIcon = subItem.icon;
                          const subActive = isActive(subItem.path);
                          return (
                            <Link
                              key={subItem.path}
                              href={subItem.path}
                              onClick={() =>
                                handleNavigation(subItem.path, subItem.tabKey)
                              }
                            >
                              <div
                                className={`flex items-center py-1.5 pl-8 pr-2.5 text-xs rounded-none cursor-pointer transition-colors ${
                                  subActive
                                    ? "bg-primary text-white font-medium"
                                    : "hover:bg-emerald-50 text-gray-600"
                                }`}
                              >
                                <SubIcon
                                  className={`mr-2 text-xs shrink-0 ${
                                    subActive ? "text-white" : "text-gray-500"
                                  }`}
                                />
                                <span className="truncate">{subItem.label}</span>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className={getMenuItemClasses(item.path, activeSub)}>
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <Icon
                          className={`text-base ${
                            active ? "text-primary" : "text-gray-700"
                          }`}
                        />
                      </div>
                      <span className="ml-2.5 text-sm font-medium whitespace-nowrap overflow-hidden">
                        {item.label}
                      </span>
                    </div>

                    {/* Sub-items (always open) */}
                    <div className="mt-1 mb-1 space-y-0.5">
                      {item.subItems!.map((subItem) => {
                        const SubIcon = subItem.icon;
                        const subActive = isActive(subItem.path);
                        return (
                          <Link
                            key={subItem.path}
                            href={subItem.path}
                            onClick={() =>
                              handleNavigation(subItem.path, subItem.tabKey)
                            }
                          >
                            <div
                              className={`flex items-center py-1.5 pl-8 pr-2.5 text-xs rounded-none cursor-pointer transition-colors ${
                                subActive
                                  ? "bg-primary text-white font-medium"
                                  : "hover:bg-emerald-50 text-gray-600"
                              }`}
                            >
                              <SubIcon
                                className={`mr-2 text-xs shrink-0 ${
                                  subActive ? "text-white" : "text-gray-500"
                                }`}
                              />
                              <span className="truncate">{subItem.label}</span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )
              ) : (
                // Regular menu item with navigation
                <Link
                  href={item.path}
                  onClick={() => handleNavigation(item.path, item.tabKey)}
                >
                  <button className={getMenuItemClasses(item.path)}>
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      <Icon
                        className={`text-base ${
                          active ? "text-white" : "text-gray-700"
                        }`}
                      />
                    </div>
                    <span
                      className={`ml-2.5 text-sm whitespace-nowrap overflow-hidden ${
                        active ? "font-medium" : ""
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Section - User Profile & Logout */}
      <footer
        className={`shrink-0 border-t pt-2.5 pb-3 flex flex-col gap-1 ${
          sidebarCollapsed ? "px-1.5 items-center" : "px-2"
        }`}
      >
        {/* User Profile */}
        <Popover
          content={userPopoverContent}
          trigger="click"
          placement={sidebarCollapsed ? "rightBottom" : "top"}
          overlayClassName="user-profile-popover"
          arrow={false}
          styles={{
            container: sidebarCollapsed
              ? { padding: 2, borderRadius: 10 }
              : { padding: 2, borderRadius: 10, marginLeft: 30 },
          }}
        >
          {sidebarCollapsed ? (
            <Tooltip
              title={businessName}
              placement="right"
              mouseEnterDelay={0.15}
            >
              <div className="w-10 h-10 flex items-center justify-center cursor-pointer rounded hover:bg-emerald-50 transition-colors">
                <Avatar
                  size={34}
                  style={{ backgroundColor: "#003220", color: "#ffffff" }}
                  className="font-bold text-xs shrink-0 shadow-sm flex items-center justify-center"
                  icon={!hasCompanyName ? <UserOutlined /> : undefined}
                >
                  {hasCompanyName ? initials : null}
                </Avatar>
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center px-1 py-1.5 cursor-pointer rounded hover:bg-emerald-50 transition-colors group">
              <Avatar
                size={34}
                style={{ backgroundColor: "#003220", color: "#ffffff" }}
                className="font-bold text-xs shrink-0 shadow-sm flex items-center justify-center"
                icon={!hasCompanyName ? <UserOutlined /> : undefined}
              >
                {hasCompanyName ? initials : null}
              </Avatar>
              <div className="ml-2 overflow-hidden truncate">
                <p
                  className="text-xs font-semibold text-gray-800 truncate group-hover:text-primary transition-colors"
                  title={businessName}
                >
                  {businessName}
                </p>
              </div>
            </div>
          )}
        </Popover>

        {/* Logout Button */}
        {sidebarCollapsed ? (
          <Tooltip title="Log out" placement="right" mouseEnterDelay={0.15}>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Log out"
              className="w-10 h-9 flex items-center justify-center rounded-none text-red-600 hover:bg-red-50 transition-all duration-200 cursor-pointer"
            >
              <Image
                src="/logout.svg"
                alt="Logout"
                width={16}
                height={16}
              />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-none text-red-600 hover:bg-red-50 transition-all duration-200 cursor-pointer text-xs font-semibold"
          >
            <Image
              src="/logout.svg"
              alt="Logout"
              width={16}
              height={16}
            />
            <span>Log out</span>
          </button>
        )}
      </footer>
    </aside>
  );
};

export default SideBar;
