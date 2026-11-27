"use client";

import React, { useState, useEffect } from "react";
import {
  OptimizationRules,
  getTenantOptimizationRules,
  updateTenantOptimizationRules,
} from "@/apis/tenant-rules.api";
import { message, Button, Spin, Select, InputNumber } from "antd";
import { Clock, Milestone, Warehouse } from "lucide-react";
import SettingsPageTitle from "@/components/Settings/SettingsPageTitle";
import { SettingCheck, SettingField, SettingFooter, SettingSection } from "@/components/Settings/SettingRow";

const DEFAULT_RULES: OptimizationRules = {
  include_first_stop: true,
  include_last_stop: true,
  reach_before_mins: 0,
  curbside_delivery: "any",
  avoid_tolls: false,
  avoid_highways: false,
};

export default function OptimizationRulesPage() {
  const [rules, setRules] = useState<OptimizationRules>(DEFAULT_RULES);
  // What is stored on the server, so the page can tell whether anything changed
  const [savedRules, setSavedRules] = useState<OptimizationRules>(DEFAULT_RULES);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        setLoading(true);
        const data = await getTenantOptimizationRules();
        if (data && data.rules) {
          setRules(data.rules);
          setSavedRules(data.rules);
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

  const hasChanges = JSON.stringify(rules) !== JSON.stringify(savedRules);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateTenantOptimizationRules(rules);
      setSavedRules(rules);
      message.success("Optimization rules saved successfully!");
    } catch (err: any) {
      message.error("Failed to save optimization rules");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="kit-fluid responsive-settings flex flex-col h-full min-w-0 min-h-0 overflow-hidden">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="responsive-toolbar flex items-center justify-between pb-4 border-b border-gray-200 shrink-0">
        <SettingsPageTitle
          title="Optimization Rules"
          description="Configure custom routing constraints and parameters applied during route optimization."
        />
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-[760px] pb-10">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spin size="default" />
          </div>
        ) : (
          <div>
            <p className="m-0 pt-4 text-xs leading-5 text-[#626F86]">
              These rules apply to every new plan. Plans already optimized keep the rules they were built with until you optimize them again.
            </p>

            <SettingSection icon={Warehouse} title="Depot and stops" description="Where each route begins and ends.">
              <SettingCheck id="rule-first-stop" label="Start at the depot" description="Each route begins at its assigned depot."
                checked={rules.include_first_stop} onChange={(checked) => setRules({ ...rules, include_first_stop: checked })} />
              <SettingCheck id="rule-last-stop" label="Return to the depot" description="Each route goes back to the depot after its last job."
                checked={rules.include_last_stop} onChange={(checked) => setRules({ ...rules, include_last_stop: checked })} />
            </SettingSection>

            <SettingSection icon={Clock} title="Timing and approach" description="How early to arrive and which side of the street to stop on.">
              <SettingField label="Arrival buffer" htmlFor="rule-reach-before" helper="Minutes added before the scheduled time window.">
                <InputNumber
                  id="rule-reach-before"
                  min={0}
                  value={rules.reach_before_mins}
                  onChange={(value) => setRules({ ...rules, reach_before_mins: Number(value ?? 0) })}
                  addonAfter="min"
                  style={{ width: 150 }}
                />
              </SettingField>
              <SettingField label="Curbside" htmlFor="rule-curbside" helper="Limits which side of the street a vehicle may stop on.">
                <Select
                  id="rule-curbside"
                  value={rules.curbside_delivery}
                  onChange={(value) => setRules({ ...rules, curbside_delivery: value as any })}
                  style={{ width: 250 }}
                  options={[
                    { value: "any", label: "Any side of street" },
                    { value: "left_only", label: "Left side delivery only" },
                    { value: "right_only", label: "Right side delivery only" },
                  ]}
                />
              </SettingField>
            </SettingSection>

            <SettingSection icon={Milestone} title="Roads" description="Road types the optimizer should stay away from.">
              <SettingCheck id="rule-tolls" label="Avoid toll roads" description="Routes stay off paid toll expressways. Trips may take longer."
                checked={rules.avoid_tolls} onChange={(checked) => setRules({ ...rules, avoid_tolls: checked })} />
              <SettingCheck id="rule-highways" label="Avoid highways" description="Routes prefer local roads over major highways. Trips may take longer."
                checked={rules.avoid_highways} onChange={(checked) => setRules({ ...rules, avoid_highways: checked })} />
            </SettingSection>

            <SettingFooter>
              <Button type="primary" onClick={handleSave} loading={saving}>Save changes</Button>
              {hasChanges && <Button type="link" onClick={() => setRules(savedRules)} disabled={saving}>Discard changes</Button>}
              {hasChanges && <span className="text-xs text-[#626F86]" role="status">You have unsaved changes.</span>}
            </SettingFooter>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
