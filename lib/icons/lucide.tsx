// One icon style for the whole app: Phosphor, light weight.
// The bundler points "lucide-react" at this file (see next.config.ts), so every existing
// `import { X } from "lucide-react"` keeps working and draws the Phosphor equivalent.
// Any name not listed here falls through to the original Lucide icon.
import { forwardRef, type ComponentType, type SVGProps } from "react";
import {
  ArrowCounterClockwise as PArrowCounterClockwise,
  ArrowDown as PArrowDown,
  ArrowLeft as PArrowLeft,
  ArrowRight as PArrowRight,
  ArrowUp as PArrowUp,
  ArrowsClockwise as PArrowsClockwise,
  ArrowsInSimple as PArrowsInSimple,
  ArrowsLeftRight as PArrowsLeftRight,
  ArrowsOutSimple as PArrowsOutSimple,
  Briefcase as PBriefcase,
  Broadcast as PBroadcast,
  Building as PBuilding,
  BuildingOffice as PBuildingOffice,
  CalendarBlank as PCalendarBlank,
  CalendarCheck as PCalendarCheck,
  CalendarX as PCalendarX,
  Car as PCar,
  CaretDown as PCaretDown,
  CaretLeft as PCaretLeft,
  CaretRight as PCaretRight,
  CaretUp as PCaretUp,
  ChartBar as PChartBar,
  ChatText as PChatText,
  Check as PCheck,
  CheckCircle as PCheckCircle,
  Clock as PClock,
  Compass as PCompass,
  Cpu as PCpu,
  Crown as PCrown,
  DotsSix as PDotsSix,
  DotsSixVertical as PDotsSixVertical,
  DotsThreeVertical as PDotsThreeVertical,
  DownloadSimple as PDownloadSimple,
  Envelope as PEnvelope,
  Equals as PEquals,
  Eye as PEye,
  FileText as PFileText,
  FileXls as PFileXls,
  Flag as PFlag,
  ForkKnife as PForkKnife,
  Gauge as PGauge,
  GearSix as PGearSix,
  GitMerge as PGitMerge,
  Globe as PGlobe,
  Hash as PHash,
  House as PHouse,
  Lock as PLock,
  Info as PInfo,
  Layout as PLayout,
  Lightbulb as PLightbulb,
  Lightning as PLightning,
  LinkedinLogo as PLinkedinLogo,
  List as PList,
  ListChecks as PListChecks,
  MagnifyingGlass as PMagnifyingGlass,
  MapPin as PMapPin,
  MapPinArea as PMapPinArea,
  MapTrifold as PMapTrifold,
  NavigationArrow as PNavigationArrow,
  NotePencil as PNotePencil,
  Package as PPackage,
  Path as PPath,
  PenNib as PPenNib,
  PencilSimple as PPencilSimple,
  Phone as PPhone,
  Pill as PPill,
  Plus as PPlus,
  Question as PQuestion,
  Repeat as PRepeat,
  RocketLaunch as PRocketLaunch,
  Scissors as PScissors,
  ShieldCheck as PShieldCheck,
  ShieldSlash as PShieldSlash,
  ShoppingCart as PShoppingCart,
  Signpost as PSignpost,
  SlidersHorizontal as PSlidersHorizontal,
  Sparkle as PSparkle,
  Stack as PStack,
  Table as PTable,
  Tag as PTag,
  Timer as PTimer,
  Trash as PTrash,
  Truck as PTruck,
  UploadSimple as PUploadSimple,
  User as PUser,
  Users as PUsers,
  Warehouse as PWarehouse,
  Warning as PWarning,
  WarningCircle as PWarningCircle,
  Wrench as PWrench,
  X as PX,
  XCircle as PXCircle,
  YoutubeLogo as PYoutubeLogo,
  SignOut as PSignOut,
  Shuffle as PShuffle,
  ListNumbers as PListNumbers,
  PaperPlaneTilt as PPaperPlaneTilt,
  DeviceMobile as PDeviceMobile,
  WhatsappLogo as PWhatsappLogo,
} from "@phosphor-icons/react/ssr";

// @ts-ignore the package's own entry file has no separate type file
export * from "../../node_modules/lucide-react/dist/esm/lucide-react.js";

type Props = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean; color?: string };
const light = (Icon: ComponentType<any>) =>
  forwardRef<SVGSVGElement, Props>(function LightIcon({ size = 24, strokeWidth: _stroke, absoluteStrokeWidth: _absolute, ...rest }, ref) {
    return <Icon ref={ref} size={size} weight="light" {...rest} />;
  });

export const AlertCircle = light(PWarningCircle);
export const AlertTriangle = light(PWarning);
export const ArrowDown = light(PArrowDown);
export const ArrowLeft = light(PArrowLeft);
export const ArrowRight = light(PArrowRight);
export const ArrowRightLeft = light(PArrowsLeftRight);
export const ArrowUp = light(PArrowUp);
export const BarChart3 = light(PChartBar);
export const Briefcase = light(PBriefcase);
export const BriefcaseBusiness = light(PBriefcase);
export const Building = light(PBuilding);
export const Building2 = light(PBuildingOffice);
export const Calendar = light(PCalendarBlank);
export const CalendarCheck = light(PCalendarCheck);
export const CalendarX = light(PCalendarX);
export const Car = light(PCar);
export const CarFront = light(PCar);
export const Check = light(PCheck);
export const CheckCircle2 = light(PCheckCircle);
export const ChevronDown = light(PCaretDown);
export const ChevronLeft = light(PCaretLeft);
export const ChevronRight = light(PCaretRight);
export const ChevronUp = light(PCaretUp);
export const CircleCheck = light(PCheckCircle);
export const CircleX = light(PXCircle);
export const ClipboardPenLine = light(PNotePencil);
export const Clock = light(PClock);
export const Clock3 = light(PClock);
export const Compass = light(PCompass);
export const Cpu = light(PCpu);
export const Crown = light(PCrown);
export const Download = light(PDownloadSimple);
export const Edit = light(PNotePencil);
export const Edit2 = light(PPencilSimple);
export const EllipsisVertical = light(PDotsThreeVertical);
export const Equal = light(PEquals);
export const Eye = light(PEye);
export const FileSpreadsheet = light(PFileXls);
export const FileText = light(PFileText);
export const Flag = light(PFlag);
export const Gauge = light(PGauge);
export const GitMerge = light(PGitMerge);
export const Globe = light(PGlobe);
export const GripHorizontal = light(PDotsSix);
export const GripVertical = light(PDotsSixVertical);
export const Hash = light(PHash);
export const HelpCircle = light(PQuestion);
export const Home = light(PHouse);
export const House = light(PHouse);
export const Lock = light(PLock);
export const Info = light(PInfo);
export const Layers = light(PStack);
export const LayoutTemplate = light(PLayout);
export const Lightbulb = light(PLightbulb);
export const Linkedin = light(PLinkedinLogo);
export const ListChecks = light(PListChecks);
export const Mail = light(PEnvelope);
export const Map = light(PMapTrifold);
export const MapPin = light(PMapPin);
export const MapPinned = light(PMapPinArea);
export const Maximize2 = light(PArrowsOutSimple);
export const Menu = light(PList);
export const MessageSquareText = light(PChatText);
export const Milestone = light(PSignpost);
export const Minimize2 = light(PArrowsInSimple);
export const Navigation = light(PNavigationArrow);
export const Navigation2 = light(PNavigationArrow);
export const Package = light(PPackage);
export const PenTool = light(PPenNib);
export const Pencil = light(PPencilSimple);
export const Phone = light(PPhone);
export const Pill = light(PPill);
export const Plus = light(PPlus);
export const Radio = light(PBroadcast);
export const RefreshCw = light(PArrowsClockwise);
export const Repeat = light(PRepeat);
export const Rocket = light(PRocketLaunch);
export const RotateCcw = light(PArrowCounterClockwise);
export const Route = light(PPath);
export const Scissors = light(PScissors);
export const Search = light(PMagnifyingGlass);
export const Settings = light(PGearSix);
export const ShieldCheck = light(PShieldCheck);
export const ShieldOff = light(PShieldSlash);
export const ShoppingCart = light(PShoppingCart);
export const SlidersHorizontal = light(PSlidersHorizontal);
export const Sparkles = light(PSparkle);
export const Table2 = light(PTable);
export const Tag = light(PTag);
export const Timer = light(PTimer);
export const Trash2 = light(PTrash);
export const Truck = light(PTruck);
export const Upload = light(PUploadSimple);
export const User = light(PUser);
export const UserRound = light(PUser);
export const Users = light(PUsers);
export const UtensilsCrossed = light(PForkKnife);
export const Warehouse = light(PWarehouse);
export const Wrench = light(PWrench);
export const X = light(PX);
export const Youtube = light(PYoutubeLogo);
export const Zap = light(PLightning);
// Added Nov 27 for the dialog headers (log out, re-optimize, share).
export const LogOut = light(PSignOut);
export const Shuffle = light(PShuffle);
export const ListOrdered = light(PListNumbers);
export const Send = light(PPaperPlaneTilt);
export const Smartphone = light(PDeviceMobile);
export const MessageCircle = light(PWhatsappLogo);
