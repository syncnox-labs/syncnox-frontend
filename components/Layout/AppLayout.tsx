"use client";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Suspense, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Spin } from "antd";
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
import { useOnboardingStore } from "@/store/onboarding.store";
import { OnboardingModal } from "@/components/Onboarding";
import { useLocationMappingStore } from "@/store/location-mapping.store";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname();
  const isSignInPage = pathname === "/sign-in";
  const hasInitialized = useRef(false);

  useDispatchSocket();
  const { data: session, status: sessionStatus } = useSession();
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
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-50">
        <Spin size="large" />
        <span className="mt-3 text-xs font-semibold text-gray-500 tracking-wider uppercase">
          Loading...
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SideBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Suspense fallback={null}>
          <NavBar />
        </Suspense>
        <main className="flex-1 overflow-y-auto p-2 px-4 pb-4 relative">{children}</main>
      </div>
      {/* Onboarding overlay — full-page, shown only after status API has loaded and if not completed */}
      {onboarding && !onboarding.is_completed && <OnboardingModal />}
    </div>
  );
};


export default AppLayout;
