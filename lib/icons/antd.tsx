// Companion to ./lucide.tsx: the Ant Design icon names used in the app, drawn with Phosphor (light).
// The bundler points "@ant-design/icons" at this file (see next.config.ts).
// The wrapper keeps Ant Design's "anticon" span so buttons, menus and font-size classes behave as before.
import { forwardRef, type ComponentType, type CSSProperties, type HTMLAttributes } from "react";
import {
  Archive as PArchive,
  ArrowClockwise as PArrowClockwise,
  ArrowCounterClockwise as PArrowCounterClockwise,
  ArrowDown as PArrowDown,
  ArrowLeft as PArrowLeft,
  ArrowRight as PArrowRight,
  ArrowUp as PArrowUp,
  ArrowsLeftRight as PArrowsLeftRight,
  CalendarBlank as PCalendarBlank,
  CalendarCheck as PCalendarCheck,
  CaretDown as PCaretDown,
  CaretLeft as PCaretLeft,
  CaretRight as PCaretRight,
  ChartBar as PChartBar,
  ChartLine as PChartLine,
  ChatText as PChatText,
  Check as PCheck,
  CheckCircle as PCheckCircle,
  CircleNotch as PCircleNotch,
  ClipboardText as PClipboardText,
  Clock as PClock,
  ClockCountdown as PClockCountdown,
  CloudArrowUp as PCloudArrowUp,
  Copy as PCopy,
  Crosshair as PCrosshair,
  DeviceMobile as PDeviceMobile,
  DotsThreeVertical as PDotsThreeVertical,
  DownloadSimple as PDownloadSimple,
  Envelope as PEnvelope,
  Export as PExport,
  FilePlus as PFilePlus,
  FileXls as PFileXls,
  Flag as PFlag,
  FloppyDisk as PFloppyDisk,
  Funnel as PFunnel,
  GearSix as PGearSix,
  House as PHouse,
  Info as PInfo,
  Lightning as PLightning,
  List as PList,
  ListBullets as PListBullets,
  MagnifyingGlass as PMagnifyingGlass,
  MapPin as PMapPin,
  Path as PPath,
  PencilSimple as PPencilSimple,
  Phone as PPhone,
  Plugs as PPlugs,
  Plus as PPlus,
  PlusCircle as PPlusCircle,
  Printer as PPrinter,
  Repeat as PRepeat,
  ShareNetwork as PShareNetwork,
  ShieldCheck as PShieldCheck,
  SignOut as PSignOut,
  SlidersHorizontal as PSlidersHorizontal,
  SquaresFour as PSquaresFour,
  Storefront as PStorefront,
  Tag as PTag,
  TextAa as PTextAa,
  Trash as PTrash,
  Truck as PTruck,
  UploadSimple as PUploadSimple,
  User as PUser,
  UserMinus as PUserMinus,
  UserPlus as PUserPlus,
  Users as PUsers,
  Warning as PWarning,
  WarningCircle as PWarningCircle,
  X as PX,
  XCircle as PXCircle,
} from "@phosphor-icons/react/ssr";

export * from "../../node_modules/@ant-design/icons/es/index.js";
export { default } from "../../node_modules/@ant-design/icons/es/index.js";

type Props = HTMLAttributes<HTMLSpanElement> & { spin?: boolean; rotate?: number; twoToneColor?: string; style?: CSSProperties };
const anticon = (Icon: ComponentType<any>, weight: "light" | "fill" = "light") =>
  forwardRef<HTMLSpanElement, Props>(function AntIcon({ className = "", spin, rotate, twoToneColor: _twoTone, ...rest }, ref) {
    return (
      <span ref={ref} role="img" className={`anticon ${className}`} {...rest}>
        <Icon size="1em" weight={weight} className={spin ? "animate-spin" : undefined} style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined} />
      </span>
    );
  });

export const AimOutlined = anticon(PCrosshair);
export const ApiOutlined = anticon(PPlugs);
export const ArrowDownOutlined = anticon(PArrowDown);
export const ArrowLeftOutlined = anticon(PArrowLeft);
export const ArrowRightOutlined = anticon(PArrowRight);
export const ArrowUpOutlined = anticon(PArrowUp);
export const BarChartOutlined = anticon(PChartBar);
export const CalendarOutlined = anticon(PCalendarBlank);
export const CarOutlined = anticon(PTruck);
export const CheckCircleFilled = anticon(PCheckCircle, "fill");
export const CheckCircleOutlined = anticon(PCheckCircle);
export const CheckOutlined = anticon(PCheck);
export const ClockCircleOutlined = anticon(PClock);
export const CloseCircleOutlined = anticon(PXCircle);
export const CloseOutlined = anticon(PX);
export const CloudUploadOutlined = anticon(PCloudArrowUp);
export const ContainerOutlined = anticon(PArchive);
export const CopyOutlined = anticon(PCopy);
export const DashboardOutlined = anticon(PSquaresFour);
export const DeleteOutlined = anticon(PTrash);
export const DownOutlined = anticon(PCaretDown);
export const DownloadOutlined = anticon(PDownloadSimple);
export const EditOutlined = anticon(PPencilSimple);
export const EnvironmentOutlined = anticon(PMapPin);
export const ExclamationCircleFilled = anticon(PWarningCircle, "fill");
export const ExclamationCircleOutlined = anticon(PWarningCircle);
export const ExportOutlined = anticon(PExport);
export const FieldStringOutlined = anticon(PTextAa);
export const FieldTimeOutlined = anticon(PClockCountdown);
export const FileAddOutlined = anticon(PFilePlus);
export const FileExcelOutlined = anticon(PFileXls);
export const FileTextOutlined = anticon(PClipboardText);
export const FilterFilled = anticon(PFunnel, "fill");
export const FilterOutlined = anticon(PFunnel);
export const FlagOutlined = anticon(PFlag);
export const HomeOutlined = anticon(PHouse);
export const InfoCircleOutlined = anticon(PInfo);
export const LeftOutlined = anticon(PCaretLeft);
export const LineChartOutlined = anticon(PChartLine);
export const LoadingOutlined = anticon(PCircleNotch);
export const LogoutOutlined = anticon(PSignOut);
export const MailOutlined = anticon(PEnvelope);
export const MenuOutlined = anticon(PList);
export const MessageOutlined = anticon(PChatText);
export const MobileOutlined = anticon(PDeviceMobile);
export const MoreOutlined = anticon(PDotsThreeVertical);
export const PhoneOutlined = anticon(PPhone);
export const PlusCircleOutlined = anticon(PPlusCircle);
export const PlusOutlined = anticon(PPlus);
export const PrinterOutlined = anticon(PPrinter);
export const ProfileOutlined = anticon(PListBullets);
export const ReloadOutlined = anticon(PArrowClockwise);
export const RetweetOutlined = anticon(PRepeat);
export const RightOutlined = anticon(PCaretRight);
export const RocketOutlined = anticon(PPath);
export const SafetyCertificateOutlined = anticon(PShieldCheck);
export const SaveOutlined = anticon(PFloppyDisk);
export const ScheduleOutlined = anticon(PCalendarCheck);
export const SearchOutlined = anticon(PMagnifyingGlass);
export const SettingOutlined = anticon(PGearSix);
export const ShareAltOutlined = anticon(PShareNetwork);
export const ShopOutlined = anticon(PStorefront);
export const SlidersOutlined = anticon(PSlidersHorizontal);
export const SwapOutlined = anticon(PArrowsLeftRight);
export const TagOutlined = anticon(PTag);
export const TeamOutlined = anticon(PUsers);
export const ThunderboltOutlined = anticon(PLightning);
export const UndoOutlined = anticon(PArrowCounterClockwise);
export const UploadOutlined = anticon(PUploadSimple);
export const UserAddOutlined = anticon(PUserPlus);
export const UserDeleteOutlined = anticon(PUserMinus);
export const UserOutlined = anticon(PUser);
export const WarningOutlined = anticon(PWarning);
