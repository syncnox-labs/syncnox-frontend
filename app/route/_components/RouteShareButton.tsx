"use client";

import { Button, Dropdown, Tooltip } from "antd";
import { DownOutlined, LoadingOutlined, MessageOutlined, ShareAltOutlined } from "@ant-design/icons";

export default function RouteShareButton({ showWhatsApp, isSharing, shareDisabled, shareLabel, onShare, onWhatsApp }: {
  showWhatsApp: boolean;
  isSharing: boolean;
  shareDisabled: boolean;
  shareLabel: string;
  onShare: () => void;
  onWhatsApp: () => void;
}) {
  if (!showWhatsApp) return <Tooltip title="Share ready driver routes. Routes with unresolved issues are skipped and listed in the result.">
    <Button size="small" type="primary" aria-label="Share saved route to drivers" icon={<ShareAltOutlined />} loading={isSharing}
      disabled={shareDisabled} onClick={onShare} className="shrink-0">
      <span className="route-action-label">{shareLabel}</span>
    </Button>
  </Tooltip>;

  return <Dropdown trigger={["click"]} placement="bottomRight" classNames={{ root: "route-actions-menu" }}
    menu={{ items: [
      { key: "drivers", icon: <ShareAltOutlined />, label: isSharing ? "Sharing…" : "Share to drivers",
        disabled: shareDisabled || isSharing, onClick: onShare },
      { key: "whatsapp", icon: <MessageOutlined />, label: "Send WhatsApp", onClick: onWhatsApp },
    ] }}>
    <Button size="small" type="primary" aria-label="Share options" aria-haspopup="menu" aria-busy={isSharing}
      icon={isSharing ? <LoadingOutlined /> : <ShareAltOutlined />} className="shrink-0">
      <span className="route-action-label">Share</span><DownOutlined aria-hidden="true" />
    </Button>
  </Dropdown>;
}
