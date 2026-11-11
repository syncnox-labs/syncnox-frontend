"use client";

import React, { useState, useEffect } from "react";
import {
  OptimizationRules,
  getTenantOptimizationRules,
  updateTenantOptimizationRules,
} from "@/apis/tenant-rules.api";
import { Save, Sliders, CheckCircle2 } from "lucide-react";
import { message, Spin, Checkbox, Select } from "antd";
import SettingsPageTitle from "@/components/Settings/SettingsPageTitle";

export default function OptimizationRulesPage() {
  const [rules, setRules] = useState<OptimizationRules>({
    include_first_stop: true,
    include_last_stop: true,
    reach_before_mins: 0,
    curbside_delivery: "any",
    avoid_tolls: false,
    avoid_highways: false,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoading(true);
        const data = await getTenantOptimizationRules();
        if (data && data.rules) {
          setRules(data.rules);
        }
      } catch (err: any) {
        console.error("Failed to load optimization rules", err);
        message.error("Failed to load optimization rules");
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateTenantOptimizationRules(rules);
      message.success("Optimization rules saved successfully!");
    } catch (err: any) {
      message.error("Failed to save optimization rules");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="responsive-settings flex flex-col h-full min-w-0 min-h-0 overflow-hidden">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="responsive-toolbar flex items-center justify-between pb-4 border-b border-gray-200 shrink-0">
        <SettingsPageTitle
          title="Optimization Rules"
          description="Configure custom routing constraints and parameters applied during route optimization."
        />
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-1.5 bg-[#003220] hover:bg-[#002417] text-white text-xs font-semibold px-4 py-2 rounded-none transition-colors cursor-pointer border-none disabled:opacity-50"
        >
          <Save size={15} />
          <span>{saving ? "Saving..." : "Save Rules"}</span>
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto mt-6 custom-scrollbar max-w-3xl">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spin size="default" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Route Stops & Depot Rules */}
            <div className="border border-gray-200 p-5 bg-white rounded-none">
              <h2 className="text-xs font-bold text-[#003220] uppercase tracking-wider m-0 mb-4 border-b border-gray-100 pb-2">
                Depot & Stop Rules
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={rules.include_first_stop}
                    onChange={(e) => setRules({ ...rules, include_first_stop: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div
                    className="cursor-pointer select-none"
                    onClick={() => setRules({ ...rules, include_first_stop: !rules.include_first_stop })}
                  >
                    <span className="text-xs font-semibold text-gray-900 block">Include Depot as First Stop</span>
                    <span className="text-[11px] text-gray-500 block mt-0.5">Route begins from the assigned depot location.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={rules.include_last_stop}
                    onChange={(e) => setRules({ ...rules, include_last_stop: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div
                    className="cursor-pointer select-none"
                    onClick={() => setRules({ ...rules, include_last_stop: !rules.include_last_stop })}
                  >
                    <span className="text-xs font-semibold text-gray-900 block">Include Depot as Last Stop</span>
                    <span className="text-[11px] text-gray-500 block mt-0.5">Route returns to the depot after all jobs are completed.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Arrival & Approach Constraints */}
            <div className="border border-gray-200 p-5 bg-white rounded-none">
              <h2 className="text-xs font-bold text-[#003220] uppercase tracking-wider m-0 mb-4 border-b border-gray-100 pb-2">
                Time & Approach Constraints
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Reach Before Window (Minutes)
                  </label>
                  <input
                    type="number"
                    value={rules.reach_before_mins}
                    onChange={(e) => setRules({ ...rules, reach_before_mins: Number(e.target.value) })}
                    placeholder="0"
                    className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220]"
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">Buffer mins added prior to scheduled window.</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Curbside Delivery Preference
                  </label>
                  <Select
                    value={rules.curbside_delivery}
                    onChange={(value) => setRules({ ...rules, curbside_delivery: value as any })}
                    className="w-full text-xs"
                    options={[
                      { value: "any", label: "Any side of street" },
                      { value: "left_only", label: "Left side delivery only" },
                      { value: "right_only", label: "Right side delivery only" },
                    ]}
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">Approach side restriction for vehicle stops.</span>
                </div>
              </div>
            </div>

            {/* Road & Toll Restrictions */}
            <div className="border border-gray-200 p-5 bg-white rounded-none">
              <h2 className="text-xs font-bold text-[#003220] uppercase tracking-wider m-0 mb-4 border-b border-gray-100 pb-2">
                Road Restrictions
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={rules.avoid_tolls}
                    onChange={(e) => setRules({ ...rules, avoid_tolls: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div
                    className="cursor-pointer select-none"
                    onClick={() => setRules({ ...rules, avoid_tolls: !rules.avoid_tolls })}
                  >
                    <span className="text-xs font-semibold text-gray-900 block">Avoid Toll Roads</span>
                    <span className="text-[11px] text-gray-500 block mt-0.5">Optimizer avoids paid toll expressways.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Checkbox
                    checked={rules.avoid_highways}
                    onChange={(e) => setRules({ ...rules, avoid_highways: e.target.checked })}
                    className="mt-0.5"
                  />
                  <div
                    className="cursor-pointer select-none"
                    onClick={() => setRules({ ...rules, avoid_highways: !rules.avoid_highways })}
                  >
                    <span className="text-xs font-semibold text-gray-900 block">Avoid Highways</span>
                    <span className="text-[11px] text-gray-500 block mt-0.5">Optimizer prefers local arteries over major highways.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
