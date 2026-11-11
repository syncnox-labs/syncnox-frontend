"use client";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Suspense, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Drawer, Spin } from "antd";
import { Menu } from "lucide-react";
import { useIndexStore } from "@/store/index.store";
import { useJobsStore } from "@/store/jobs.store";
import { useTeamStore } from "@/store/team.store";
import SideBar from "@/components/Layout/SideBar";
import NavBar from "@/components/Layout/NavBar";
import { useRouteStore } from "@/store/routes.store";
import { useDepotStore } from "@/store/depots.store";
import { useVehicleStore } from "@/store/vehicle.store";
import { useAutoSyncTab } from "@/hooks/useAutoSyncTab";
import { useDispatchSocket } from "@/hooks/useDispatchSocket";
import { useDriverPresence } from "@/hooks/useDriverPresence";
import { useOnboardingStore } from "@/store/onboarding.store";
import { OnboardingModal } from "@/components/Onboarding";
import { useLocationMappingStore } from "@/store/location-mapping.store";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isSignInPage = pathname === "/sign-in";
  const hasInitialized = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setMobileMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  useDispatchSocket();
  const { data: session, status: sessionStatus } = useSession();
  useDriverPresence(session?.user?.tenant_id);
  const { setUser, clearUser } = useIndexStore();
  const { initializeTeams } = useTeamStore();
  const { initializeRoutes } = useRouteStore();
  const { initializeDepots } = useDepotStore();
  const { initializeVehicles } = useVehicleStore();
  const { fetchOnboardingStatus, onboarding, hasFetchedStatus } = useOnboardingStore();
  const { initializeLocationMappings } = useLocationMappingStore();

  // Register AG Grid modules on client side only to prevent hydration issues
  useEffect(() => {
    ModuleRegistry.registerModules([AllCommunityModule]);
  }, []);
  useAutoSyncTab();

  // Sync session with user store and fetch onboarding status once on mount / page refresh
  const hasFetchedOnboardingRef = useRef(false);

  useEffect(() => {
    if (session?.user && !isSignInPage) {
      setUser({
        id: session.user.id,
        email: session.user.email,
        tenant_id: session.user.tenant_id.toString(),
      });
      
      // Fetch latest onboarding status from backend DB once on mount / page refresh
      if (!hasFetchedOnboardingRef.current) {
        hasFetchedOnboardingRef.current = true;
        fetchOnboardingStatus().catch(() => {});
      }
    } else if (!session && sessionStatus !== "loading" && !isSignInPage) {
      // Session expired or user logged out
      clearUser();
    }
  }, [session, sessionStatus, isSignInPage, setUser, clearUser, fetchOnboardingStatus]);

  // Initialize jobs and resources for authenticated pages
  const { initializeJobs } = useJobsStore();
  useEffect(() => {
    if (!isSignInPage && !hasInitialized.current) {
      hasInitialized.current = true;
      initializeJobs();
      initializeTeams();
      initializeRoutes();
      initializeDepots();
      initializeVehicles();
      initializeLocationMappings();
    }
  }, [isSignInPage, initializeJobs, initializeTeams, initializeRoutes, initializeDepots, initializeVehicles, initializeLocationMappings]);

  if (isSignInPage) {
    return <>{children}</>;
  }

  // Show loading spinner while session is loading or while initial onboarding status API call is in-flight
  if (sessionStatus === "loading" || (session?.user && !hasFetchedStatus)) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center bg-gray-50">
        <Spin size="large" />
        <span className="mt-3 text-xs font-semibold text-gray-500 tracking-wider uppercase">
          Loading...
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-dvh min-w-0 flex-col overflow-hidden lg:flex-row">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 lg:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-controls="mobile-navigation"
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Menu size={22} />
        </button>
        <Link href="/dashboard" aria-label="Syncnox dashboard" className="flex min-h-11 items-center">
          <Image src="/syncnox.svg" alt="Syncnox" width={116} height={32} priority />
        </Link>
      </header>
      <div className="hidden h-full shrink-0 lg:block"><SideBar /></div>
      <Drawer
        id="mobile-navigation"
        title="Navigation"
        placement="left"
        size={280}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        destroyOnHidden
        classNames={{ body: "!p-0" }}
        styles={{ body: { padding: 0, overflow: "hidden" }, wrapper: { maxWidth: "calc(100vw - 32px)" } }}
      >
        <SideBar mobile onNavigate={() => setMobileMenuOpen(false)} />
      </Drawer>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={null}>
          <NavBar />
        </Suspense>
        <main className={`relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 ${pathname === "/plan" ? "!pt-2" : ""}`}>{children}</main>
      </div>
      {/* Onboarding overlay — full-page, shown only after status API has loaded and if not completed */}
      {onboarding && !onboarding.is_completed && <OnboardingModal />}
    </div>
  );
};


export default AppLayout;
