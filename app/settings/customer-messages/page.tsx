"use client";

import React, { useState } from "react";
import { Save, MessageSquare } from "lucide-react";
import { message, Checkbox } from "antd";

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900 m-0">Customer Messages</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Configure the automated SMS or Email messages that are sent to your customers.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 bg-[#003220] hover:bg-[#002417] text-white text-xs font-semibold px-4 py-2 rounded-none transition-colors cursor-pointer border-none disabled:opacity-50"
        >
          <Save size={15} />
          <span>{saving ? "Saving..." : "Save Settings"}</span>
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto mt-6 custom-scrollbar pb-10">
        <div className="space-y-6">
          
          {/* Job Scheduled Message */}
          <div className="border border-gray-200 p-5 bg-white rounded-none">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-xs font-bold text-[#003220] uppercase tracking-wider m-0 flex items-center gap-2">
                <MessageSquare size={14} />
                Job Scheduled
              </h2>
              <Checkbox
                checked={settings.scheduled_enabled}
                onChange={(e) => setSettings({ ...settings, scheduled_enabled: e.target.checked })}
              >
                <span className="text-xs font-semibold text-gray-700">Enable</span>
              </Checkbox>
            </div>
            <div className={`transition-opacity ${!settings.scheduled_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Message Template
              </label>
              <textarea
                value={settings.scheduled_message}
                onChange={(e) => setSettings({ ...settings, scheduled_message: e.target.value })}
                rows={3}
                placeholder="Enter message template..."
                className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220] resize-none"
              />
              <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-2">
                <span className="font-semibold">Available variables:</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{customer_name}}"}</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{date}}"}</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{tracking_link}}"}</span>
              </div>
            </div>
          </div>

          {/* En Route Message */}
          <div className="border border-gray-200 p-5 bg-white rounded-none">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-xs font-bold text-[#003220] uppercase tracking-wider m-0 flex items-center gap-2">
                <MessageSquare size={14} />
                Driver En Route
              </h2>
              <Checkbox
                checked={settings.en_route_enabled}
                onChange={(e) => setSettings({ ...settings, en_route_enabled: e.target.checked })}
              >
                <span className="text-xs font-semibold text-gray-700">Enable</span>
              </Checkbox>
            </div>
            <div className={`transition-opacity ${!settings.en_route_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Message Template
              </label>
              <textarea
                value={settings.en_route_message}
                onChange={(e) => setSettings({ ...settings, en_route_message: e.target.value })}
                rows={3}
                placeholder="Enter message template..."
                className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220] resize-none"
              />
              <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-2">
                <span className="font-semibold">Available variables:</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{customer_name}}"}</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{driver_name}}"}</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{eta}}"}</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{tracking_link}}"}</span>
              </div>
            </div>
          </div>

          {/* Job Completed Message */}
          <div className="border border-gray-200 p-5 bg-white rounded-none">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-xs font-bold text-[#003220] uppercase tracking-wider m-0 flex items-center gap-2">
                <MessageSquare size={14} />
                Job Completed
              </h2>
              <Checkbox
                checked={settings.completed_enabled}
                onChange={(e) => setSettings({ ...settings, completed_enabled: e.target.checked })}
              >
                <span className="text-xs font-semibold text-gray-700">Enable</span>
              </Checkbox>
            </div>
            <div className={`transition-opacity ${!settings.completed_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Message Template
              </label>
              <textarea
                value={settings.completed_message}
                onChange={(e) => setSettings({ ...settings, completed_message: e.target.value })}
                rows={3}
                placeholder="Enter message template..."
                className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220] resize-none"
              />
              <div className="mt-2 text-[11px] text-gray-500 flex flex-wrap gap-2">
                <span className="font-semibold">Available variables:</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{customer_name}}"}</span>
                <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 cursor-default">{"{{driver_name}}"}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
