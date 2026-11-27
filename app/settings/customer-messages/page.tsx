"use client";

import React, { useState } from "react";
import { message, Button, Input } from "antd";
import { SettingCheck, SettingField, SettingFooter, SettingSection } from "@/components/Settings/SettingRow";
import { CalendarCheck, CircleCheck, Truck } from "lucide-react";
import SettingsPageTitle from "@/components/Settings/SettingsPageTitle";

interface MessageSettings {
  scheduled_enabled: boolean;
  scheduled_message: string;
  en_route_enabled: boolean;
  en_route_message: string;
  completed_enabled: boolean;
  completed_message: string;
}

export default function CustomerMessagesPage() {
  const [settings, setSettings] = useState<MessageSettings>({
    scheduled_enabled: true,
    scheduled_message: "Hi {{customer_name}}, your pickup is scheduled for {{date}}. Track it here: {{tracking_link}}",
    en_route_enabled: true,
    en_route_message: "Hi {{customer_name}}, our driver {{driver_name}} is en route and should arrive around {{eta}}. Track it here: {{tracking_link}}",
    completed_enabled: false,
    completed_message: "Hi {{customer_name}}, your pickup has been completed. Thank you for choosing us!",
  });
  
  const [saving, setSaving] = useState<boolean>(false);

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    setTimeout(() => {
      setSaving(false);
      message.success("Customer messages settings saved successfully!");
    }, 800);
  };

  const messages: { key: "scheduled" | "en_route" | "completed"; icon: typeof Truck; title: string; when: string; variables: string[] }[] = [
    { key: "scheduled", icon: CalendarCheck, title: "Job scheduled", when: "Sent when a job is given a date.", variables: ["{{customer_name}}", "{{date}}", "{{tracking_link}}"] },
    { key: "en_route", icon: Truck, title: "Driver en route", when: "Sent when the driver sets off for the customer.", variables: ["{{customer_name}}", "{{driver_name}}", "{{eta}}", "{{tracking_link}}"] },
    { key: "completed", icon: CircleCheck, title: "Job completed", when: "Sent when the job is marked done.", variables: ["{{customer_name}}", "{{driver_name}}"] },
  ];

  return (
    <div className="kit-fluid responsive-settings flex flex-col h-full min-w-0 min-h-0 overflow-hidden">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="responsive-toolbar flex items-center justify-between pb-4 border-b border-gray-200 shrink-0">
        <SettingsPageTitle
          title="Customer Messages"
          description="Configure the automated SMS or Email messages that are sent to your customers."
        />
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-[760px] pb-10">
          {/* The server has no endpoint for these settings yet: saving used to show "saved" while nothing was stored
              and no message is sent from this page. Say so plainly until the server side exists. */}
          <div role="status" className="lang mt-4 border-l-2 border-[#B38600] bg-[#FFF8E6] px-3 py-2 text-[13px] text-[#12211A]">
            Not connected yet. These settings are not saved, and no message is sent from this page. Messages to passengers are sent from a plan, with Send WhatsApp in its menu, when WhatsApp messaging is switched on.
          </div>
          {messages.map(({ key, icon, title, when, variables }) => {
            const enabledKey = `${key}_enabled` as const;
            const messageKey = `${key}_message` as const;
            const enabled = settings[enabledKey];
            return (
              <SettingSection key={key} icon={icon} title={title} description={when}>
                <SettingCheck id={`send-${key}`} label="Send this message" checked={enabled}
                  onChange={(checked) => setSettings({ ...settings, [enabledKey]: checked })} />
                <div className={`transition-opacity ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
                  <SettingField label="Message" htmlFor={`message-${key}`}>
                    <Input.TextArea
                      id={`message-${key}`}
                      value={settings[messageKey]}
                      onChange={(event) => setSettings({ ...settings, [messageKey]: event.target.value })}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      disabled={!enabled}
                    />
                    <p className="m-0 mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-[#626F86]">
                      You can use
                      {variables.map((variable) => (
                        <code key={variable} className="border border-[#DCDFE4] bg-[#F7F8F9] px-1.5 py-0.5 font-mono text-[11px] text-[#44546F]">{variable}</code>
                      ))}
                    </p>
                  </SettingField>
                </div>
              </SettingSection>
            );
          })}
          <SettingFooter>
            <Button type="primary" onClick={handleSave} loading={saving} disabled title="Saving is not connected to the server yet">Save changes</Button>
          </SettingFooter>
        </div>
      </div>
    </div>
  );
}
