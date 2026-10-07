import { TabKey } from "@/store/index.store";
import {
  RocketOutlined,
  BarChartOutlined,
  CalendarOutlined,
  LineChartOutlined,
  AimOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  CarOutlined,
  EnvironmentOutlined,
  DashboardOutlined,
  FieldStringOutlined,
  SlidersOutlined,
  MessageOutlined,
} from "@ant-design/icons";

interface SubMenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  tabKey: TabKey;
}

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  tabKey: TabKey;
  subItems?: SubMenuItem[];
}

export const MENU_ITEMS: MenuItem[] = [
  {
    icon: DashboardOutlined,
    label: "Dashboard",
    path: "/dashboard",
    tabKey: "dashboard",
  },
  {
    icon: RocketOutlined,
    label: "Plan",
    path: "/plan",
    tabKey: "jobs",
  },
  {
    icon: SettingOutlined,
    label: "Settings",
    path: "/settings",
    tabKey: "team",
    subItems: [
      { icon: TeamOutlined, label: "Team", path: "/team", tabKey: "team" },
      {
        icon: CarOutlined,
        label: "Vehicle",
        path: "/vehicle",
        tabKey: "vehicle",
      },
      {
        icon: EnvironmentOutlined,
        label: "Location",
        path: "/locations",
        tabKey: "location",
      },
      {
        icon: FieldStringOutlined,
        label: "Custom Fields",
        path: "/settings/custom-fields",
        tabKey: "team",
      },
      {
        icon: SlidersOutlined,
        label: "Optimization Rules",
        path: "/settings/optimization-rules",
        tabKey: "team",
      },
      {
        icon: MessageOutlined,
        label: "Messages",
        path: "/settings/customer-messages",
        tabKey: "customer-messages",
      },
    ],
  },
];

export const HOVER_CLOSE_DELAY = 200;
