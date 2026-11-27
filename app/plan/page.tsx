"use client";

import { useIndexStore } from "@/store/index.store";
import JobsList from "./_components/JobsList";
import RoutesView from "./_components/RoutesView";
import ScheduleView from "./_components/ScheduleView";

const page = () => {
  const { currentTab } = useIndexStore();

  const renderTabContent = () => {
    switch (currentTab) {
      case "jobs":
        return <JobsList />;
      case "routes":
        return <RoutesView />;
      case "schedule":
        return <ScheduleView />;
      default:
        return <JobsList />;
    }
  };

  // "lang" opts this screen into the Syncnox interface language (fills, two weights, one accent); see app/globals.css
  return <div className="lang relative h-full w-full">{renderTabContent()}</div>;
};

export default page;
