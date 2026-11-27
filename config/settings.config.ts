import type { ComponentType } from "react";
import type { TabKey } from "@/store/index.store";
import { Users, Truck, MapPin, SlidersHorizontal, ListChecks, MessageSquareText } from "lucide-react";

/**
 * The settings registry: one place that defines every settings destination.
 * The Settings dropdown in the sidebar reads from it,
 * so a new feature is added by adding one item here (and its page).
 *
 * Groups answer "what does this change?":
 *   resources     - the people, vehicles and places a plan is built from
 *   planning      - how plans are calculated and which fields jobs carry
 *   communication - what drivers and customers are told
 */

export interface SettingsItem {
  key: string;
  /** Noun first, as short as it can be */
  label: string;
  /** One line that says what changing this affects */
  description: string;
  path: string;
  /** Tab the app selects when this page opens */
  tabKey: TabKey;
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  /** Extra words people may type when searching */
  keywords: string[];
}

export interface SettingsGroup {
  key: string;
  label: string;
  /** One word for narrow menus */
  shortLabel: string;
  description: string;
  items: SettingsItem[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    key: "resources",
    label: "People, vehicles and places",
    shortLabel: "Resources",
    description: "What every plan is built from.",
    items: [
      {
        key: "team",
        label: "Team",
        description: "Drivers and staff, their working hours, skills, start points and mobile app access.",
        path: "/team",
        tabKey: "team",
        icon: Users,
        keywords: ["driver", "drivers", "people", "members", "hours", "shift", "skills", "license", "overtime", "app", "zones"],
      },
      {
        key: "vehicle",
        label: "Vehicles",
        description: "The fleet, how many seats or how much load each carries, and who may drive it.",
        path: "/vehicle",
        tabKey: "vehicle",
        icon: Truck,
        keywords: ["fleet", "bus", "van", "car", "seats", "capacity", "plate", "constraints", "skills"],
      },
      {
        key: "locations",
        label: "Locations",
        description: "Depots where routes start, and saved places such as stations and customer sites.",
        path: "/locations",
        tabKey: "location",
        icon: MapPin,
        keywords: ["depot", "depots", "places", "stations", "metro", "sites", "addresses", "aliases", "import"],
      },
    ],
  },
  {
    key: "planning",
    label: "Planning",
    shortLabel: "Planning",
    description: "How routes are calculated and what a job contains.",
    items: [
      {
        key: "optimization-rules",
        label: "Optimization rules",
        description: "Rules the optimizer follows on every plan: depot stops, arrival buffer, road limits.",
        path: "/settings/optimization-rules",
        tabKey: "team",
        icon: SlidersHorizontal,
        keywords: ["routing", "optimizer", "depot", "tolls", "highways", "curbside", "buffer", "early", "constraints"],
      },
      {
        key: "custom-fields",
        label: "Custom fields",
        description: "The fields on jobs, vehicles, team members and depots, and where each one shows.",
        path: "/settings/custom-fields",
        tabKey: "team",
        icon: ListChecks,
        keywords: ["fields", "columns", "templates", "required", "worker shuttle", "pickup delivery", "proof of delivery"],
      },
    ],
  },
  {
    key: "communication",
    label: "Communication",
    shortLabel: "Communication",
    description: "What customers are told, and when.",
    items: [
      {
        key: "customer-messages",
        label: "Messages",
        description: "Message templates sent to customers when a job is scheduled, on the way or done.",
        path: "/settings/customer-messages",
        tabKey: "customer-messages",
        icon: MessageSquareText,
        keywords: ["sms", "email", "whatsapp", "notifications", "templates", "customers", "alerts"],
      },
    ],
  },
];

export const SETTINGS_ITEMS: SettingsItem[] = SETTINGS_GROUPS.flatMap((group) => group.items);

/** True for the settings home and every page listed in the registry. */
export const isSettingsPath = (pathname: string): boolean =>
  pathname === "/settings" || SETTINGS_ITEMS.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));

/** Groups and items matching a search, by label, description or keyword. */
export const searchSettings = (query: string): SettingsGroup[] => {
  const q = query.trim().toLowerCase();
  if (!q) return SETTINGS_GROUPS;
  return SETTINGS_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        [item.label, item.description, ...item.keywords].some((text) => text.toLowerCase().includes(q)),
      ),
    }))
    .filter((group) => group.items.length > 0);
};
