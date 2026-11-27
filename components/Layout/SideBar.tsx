"use client";
import Link from "next/link";
import { useState, useCallback, useEffect } from "react";
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
} from "@ant-design/icons";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { SidebarSimple, SignOut } from "@phosphor-icons/react/ssr";
import { TabKey, useIndexStore } from "@/store/index.store";
import { useOnboardingStore } from "@/store/onboarding.store";
import { useTeamStore } from "@/store/team.store";
import { useVehicleStore } from "@/store/vehicle.store";
import { useDepotStore } from "@/store/depots.store";
import { signOut } from "next-auth/react";
import { MENU_ITEMS } from "./sidebar.constants";
import { SETTINGS_GROUPS, isSettingsPath } from "@/config/settings.config";

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
  // Settings takes over the sidebar, as in Jira: the same width shows the settings list with a way back.
  const [settingsLayer, setSettingsLayer] = useState(() => isSettingsPath(pathname));
  useEffect(() => {
    setSettingsLayer(isSettingsPath(pathname));
  }, [pathname]);
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
          shape="square" style={{ backgroundColor: "#F3F6F4", color: "#12211A", borderRadius: 0 }}
          className="font-medium text-sm flex items-center justify-center"
          icon={!hasCompanyName ? <UserOutlined /> : undefined}
        >
          {hasCompanyName ? initials : null}
        </Avatar>
        <h3
          className="text-sm font-medium text-[#12211A] leading-tight mb-0.5 text-center truncate max-w-full px-2 mt-2"
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
      <div className="pt-2 border-t border-[#E3E8E5]">
        <button
          type="button"
          onClick={() => setShowStatsInPopover((prev) => !prev)}
          className="w-full flex items-center justify-between text-[13px] px-2.5 h-9 bg-transparent border-0 hover:bg-[#F3F6F4] transition-colors cursor-pointer font-medium text-[#12211A]"
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
            className="w-full flex items-center justify-between text-[13px] px-2.5 h-9 bg-transparent border-0 hover:bg-[#F3F6F4] transition-colors cursor-pointer text-left group"
          >
            <div className="flex items-center gap-2.5 text-[#12211A]">
              <div className="flex items-center justify-center text-[#4A5750] text-base shrink-0">
                <TeamOutlined />
              </div>
              <span>Team Members</span>
            </div>
            <span className="text-[13px] font-medium tabular-nums text-[#12211A]">
              {teams.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigation("/vehicle", "vehicle");
              router.push("/vehicle");
            }}
            className="w-full flex items-center justify-between text-[13px] px-2.5 h-9 bg-transparent border-0 hover:bg-[#F3F6F4] transition-colors cursor-pointer text-left group"
          >
            <div className="flex items-center gap-2.5 text-[#12211A]">
              <div className="flex items-center justify-center text-[#4A5750] text-base shrink-0">
                <CarOutlined />
              </div>
              <span>Vehicles</span>
            </div>
            <span className="text-[13px] font-medium tabular-nums text-[#12211A]">
              {vehicles.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleNavigation("/locations", "location");
              router.push("/locations");
            }}
            className="w-full flex items-center justify-between text-[13px] px-2.5 h-9 bg-transparent border-0 hover:bg-[#F3F6F4] transition-colors cursor-pointer text-left group"
          >
            <div className="flex items-center gap-2.5 text-[#12211A]">
              <div className="flex items-center justify-center text-[#4A5750] text-base shrink-0">
                <EnvironmentOutlined />
              </div>
              <span>Locations</span>
            </div>
            <span className="text-[13px] font-medium tabular-nums text-[#12211A]">
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
      return "w-full flex items-center h-9 px-4 border-0 transition-colors cursor-pointer bg-white text-[#12211A] font-medium shadow-[inset_2px_0_0_#0B5D3B]";
    }
    if (hasActiveSub) {
      return "w-full flex items-center h-9 px-4 border-0 bg-transparent transition-colors cursor-pointer text-[#12211A] font-medium";
    }
    return "w-full flex items-center h-9 px-4 border-0 bg-transparent transition-colors cursor-pointer text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]";
  };

  return (
    <aside
      aria-label={mobile ? "Mobile navigation" : "Sidebar"}
      className={`relative z-20 bg-[#F3F6F4] flex flex-col shrink-0 transition-[width] duration-200 ease-in-out ${
        mobile ? "h-full w-full [&_nav_button]:min-h-11 [&_nav_a>div]:min-h-11 [&_footer_button]:min-h-11" : `h-dvh ${sidebarCollapsed ? "w-14" : "w-52"}`
      }`}
    >
      {!mobile && (
        <Tooltip title={sidebarCollapsed ? "Open sidebar" : "Close sidebar"} placement="right" mouseEnterDelay={0.15}>
          <button
            type="button"
            onClick={handleToggleSidebar}
            aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
            aria-expanded={!sidebarCollapsed}
            className={`absolute z-30 flex h-7 w-7 items-center justify-center border-0 bg-transparent text-[#626E67] hover:bg-[#E3E8E5] hover:text-[#12211A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5D3B] transition-colors cursor-pointer ${sidebarCollapsed ? "left-1/2 top-[54px] -translate-x-1/2" : "right-2 top-[14px]"}`}
          >
            <SidebarSimple size={18} weight="light" aria-hidden="true" />
          </button>
        </Tooltip>
      )}

      {/* Logo Section */}
      {!mobile && (sidebarCollapsed ? (
        <div className="h-14 px-2 mb-10 flex items-center justify-center shrink-0">
          <Link
            href="/dashboard"
            onClick={() => handleNavigation("/dashboard", "dashboard")}
            aria-label="Syncnox dashboard"
            className="w-10 h-10 flex items-center justify-center hover:bg-[#E9EEEB] transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Image
              src="/logo.svg"
              alt="SYNCNOX"
              width={22}
              height={22}
              className="mix-blend-multiply"
              priority
            />
          </Link>
        </div>
      ) : (
        <div className="h-14 pl-4 pr-10 mb-2 flex items-center justify-between shrink-0">
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
                className="h-7 w-auto object-contain mix-blend-multiply"
                priority
              />
            </div>
          </Link>
        </div>
      ))}

      {/* Main Menu Items */}
      <nav
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden ${
          mobile ? "pt-3" : ""
        }`}
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#E5E7EB transparent",
        }}
      >
        {!sidebarCollapsed && settingsLayer ? (
          <div>
            <button
              type="button"
              onClick={() => setSettingsLayer(false)}
              className={`flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent px-4 text-sm transition-colors text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A] ${mobile ? "min-h-11" : "h-9"}`}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
            <p className="m-0 px-4 pb-1 pt-3 text-[17px] font-medium tracking-[-0.015em] text-[#12211A]">Settings</p>
            {SETTINGS_GROUPS.map((group) => (
              <div key={group.key} className="pt-3">
                <p className="m-0 px-4 pb-1.5 text-[11px] font-medium uppercase tracking-[0.09em] text-[#626E67]">{group.shortLabel}</p>
                {group.items.map((entry) => {
                  const on = pathname === entry.path || pathname.startsWith(`${entry.path}/`);
                  const EntryIcon = entry.icon;
                  return (
                    <Link
                      key={entry.key}
                      href={entry.path}
                      aria-current={on ? "page" : undefined}
                      onClick={() => handleNavigation(entry.path, entry.tabKey)}
                    >
                      <div
                        className={`mb-0.5 flex items-center gap-2.5 px-4 text-sm transition-colors ${mobile ? "min-h-11" : "h-8"} ${
                          on ? "bg-white text-[#12211A] font-medium shadow-[inset_2px_0_0_#0B5D3B]" : "text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
                        }`}
                      >
                        <EntryIcon size={17} strokeWidth={1.75} className="shrink-0" />
                        <span className="truncate">{entry.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        ) : MENU_ITEMS.map((item) => {
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const activeSub = hasActiveSubItem(item.subItems);
          const active = isActive(item.path) || activeSub;
          const Icon = item.icon;

          if (sidebarCollapsed) {
            return (
              <div key={item.path} className="mb-0.5 flex justify-center [&>a]:block [&>a]:w-full [&>span]:block [&>span]:w-full">
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
                                    ? "bg-white text-[#12211A] font-medium shadow-[inset_2px_0_0_#0B5D3B]"
                                    : "text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
                                }`}
                              >
                                <SubIcon
                                  className={`mr-2 text-xs shrink-0 ${
                                    subActive ? "text-[#12211A]" : "text-[#626E67]"
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
                      className={`w-full h-10 flex items-center justify-center border-0 transition-colors cursor-pointer ${
                        activeSub
                          ? "bg-white text-[#12211A] shadow-[inset_2px_0_0_#0B5D3B]"
                          : "bg-transparent text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
                      }`}
                    >
                      <Icon
                        className={`text-base ${
                          active ? "text-[#12211A]" : "text-[#4A5750]"
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
                        className={`w-full h-10 flex items-center justify-center border-0 transition-colors cursor-pointer ${
                          active
                            ? "bg-white text-[#12211A] shadow-[inset_2px_0_0_#0B5D3B]"
                            : "bg-transparent text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
                        }`}
                      >
                        <Icon
                          className={`text-base ${
                            active ? "text-[#12211A]" : "text-[#4A5750]"
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
            <div key={item.path} className="mb-0.5">
              {hasSubItems ? (
                item.label === "Settings" ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={settingsOpen}
                      className={getMenuItemClasses(item.path, activeSub)}
                      onClick={() => setSettingsLayer(true)}
                    >
                      <div className="w-5 h-5 flex items-center justify-center shrink-0">
                        <Icon
                          className={`text-base ${
                            active ? "text-[#12211A]" : "text-[#4A5750]"
                          }`}
                        />
                      </div>
                      <span className="ml-2.5 text-sm whitespace-nowrap overflow-hidden">
                        {item.label}
                      </span>
                      <ChevronRight size={14} className="ml-auto text-[#626E67]" aria-hidden="true" />
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
                                    ? "bg-white text-[#12211A] font-medium shadow-[inset_2px_0_0_#0B5D3B]"
                                    : "text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
                                }`}
                              >
                                <SubIcon
                                  className={`mr-2 text-xs shrink-0 ${
                                    subActive ? "text-[#12211A]" : "text-[#626E67]"
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
                            active ? "text-[#12211A]" : "text-[#4A5750]"
                          }`}
                        />
                      </div>
                      <span className="ml-2.5 text-sm whitespace-nowrap overflow-hidden">
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
                                  ? "bg-white text-[#12211A] font-medium shadow-[inset_2px_0_0_#0B5D3B]"
                                  : "text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
                              }`}
                            >
                              <SubIcon
                                className={`mr-2 text-xs shrink-0 ${
                                  subActive ? "text-[#12211A]" : "text-[#626E67]"
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
                          active ? "text-[#12211A]" : "text-[#4A5750]"
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
        className={`shrink-0 pt-2 pb-3 flex flex-col gap-0.5 ${
          sidebarCollapsed ? "items-center" : ""
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
              ? { padding: 2, borderRadius: 0 }
              : { padding: 2, borderRadius: 0, marginLeft: 30 },
          }}
        >
          {sidebarCollapsed ? (
            <Tooltip
              title={businessName}
              placement="right"
              mouseEnterDelay={0.15}
            >
              <div className="w-14 h-10 flex items-center justify-center cursor-pointer hover:bg-[#E9EEEB] transition-colors">
                <Avatar
                  size={30}
                  shape="square" style={{ backgroundColor: "#ffffff", color: "#12211A", borderRadius: 0 }}
                  className="font-medium text-xs shrink-0 flex items-center justify-center"
                  icon={!hasCompanyName ? <UserOutlined /> : undefined}
                >
                  {hasCompanyName ? initials : null}
                </Avatar>
              </div>
            </Tooltip>
          ) : (
            <div className="flex items-center px-4 h-11 cursor-pointer hover:bg-[#E9EEEB] transition-colors group">
              <Avatar
                size={30}
                shape="square" style={{ backgroundColor: "#ffffff", color: "#12211A", borderRadius: 0 }}
                className="font-medium text-xs shrink-0 flex items-center justify-center"
                icon={!hasCompanyName ? <UserOutlined /> : undefined}
              >
                {hasCompanyName ? initials : null}
              </Avatar>
              <div className="ml-2.5 overflow-hidden truncate">
                <p
                  className="m-0 text-[13px] font-medium text-[#12211A] truncate"
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
              className="w-full h-9 flex items-center justify-center border-0 bg-transparent transition-colors cursor-pointer text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
            >
              <SignOut size={18} weight="light" aria-hidden="true" />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-4 h-9 border-0 bg-transparent transition-colors cursor-pointer text-sm text-[#4A5750] hover:bg-[#E9EEEB] hover:text-[#12211A]"
          >
            <SignOut size={18} weight="light" aria-hidden="true" />
            <span>Log out</span>
          </button>
        )}
      </footer>
    </aside>
  );
};

export default SideBar;
