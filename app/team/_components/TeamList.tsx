"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button, Spin, Modal, message } from "antd";
import { Search, Users, Upload, Plus, Trash2, Download } from "lucide-react";
import { Team } from "@/types/team.type";
import { useTeamStore } from "@/store/team.store";
import { exportTeamMembers } from "@/apis/team.api";
import { generateTeamMembersCsv, triggerDownload } from "@/utils/exportCsv.utils";
import TeamMemberForm from "./TeamMemberForm";
import AddTeamMemberModal from "./AddTeamMemberModal";
import TeamMemberCard from "./TeamMemberCard";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";

import EntityViewToggle from "@/components/Settings/EntityViewToggle";
import { useSettingsViewStore } from "@/store/settings-view.store";
import EntityRecordTable from "@/components/Settings/EntityRecordTable";
import SettingsPageTitle from "@/components/Settings/SettingsPageTitle";
import { createTeamSettingsColumns } from "@/utils/settingsTable.columns";
import { useVehicleStore } from "@/store/vehicle.store";

const TeamList = () => {
  const { isLoading, teams, bulkDeleteTeamsAction } = useTeamStore();

  const view = useSettingsViewStore(state => state.view);
  const setView = useSettingsViewStore(state => state.setView);
  const { vehicles } = useVehicleStore();
  const tableColumns = useMemo(() => createTeamSettingsColumns(vehicles), [vehicles]);

  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const openTableRecord = useCallback((record: Team) => {
    setSelectedTeam(record);
    setMobileDetailOpen(true);
    setView("form");
  }, [setView]);

  // Auto-select first member on initial load
  useEffect(() => {
    if (!selectedTeam && teams.length > 0) {
      setSelectedTeam(teams[0]);
    }
  }, [teams]);

  // Keep selected team data fresh when the store updates
  useEffect(() => {
    if (selectedTeam) {
      const fresh = teams.find((t) => t.id === selectedTeam.id);
      if (fresh) {
        setSelectedTeam(fresh);
      } else if (teams.length > 0) {
        setSelectedTeam(teams[0]);
      } else {
        setSelectedTeam(null);
      }
    }
  }, [teams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teams.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [teams, search]);

  const inactiveCount = useMemo(() => teams.filter((t) => t.status === "inactive").length, [teams]);

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (checkedIds.length === filtered.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(filtered.map((t) => t.id));
    }
  };

  const handleBulkDelete = () => {
    if (checkedIds.length === 0) return;

    Modal.confirm({
      title: "Bulk Delete Team Members",
      content: `Are you sure you want to delete ${checkedIds.length} team member(s)? This action cannot be undone.`,
      okText: "Delete All",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await bulkDeleteTeamsAction(checkedIds);
          message.success(`${checkedIds.length} team member(s) deleted`);
          setCheckedIds([]);
        } catch (err: any) {
          message.error(typeof err?.detail === "string" ? err.detail : err?.message || "Failed to delete team members");
        }
      },
    });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const count = teams.length;

      try {
        await exportTeamMembers();
      } catch (apiErr) {
        // Fallback to client-side CSV generation if backend endpoint is unavailable
        const csv = generateTeamMembersCsv(teams);
        triggerDownload("drivers_export.csv", csv);
      }
      message.success(`Successfully exported ${count} driver(s) to CSV`);
    } catch (err: any) {
      message.error(err?.message || "Failed to export drivers");
    } finally {
      setIsExporting(false);
    }
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  // Keep open dialogs mounted while the first create/import request is running.
  if (isLoading && teams.length === 0 && !addModalOpen && !bulkModalOpen) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="lang kit-fluid responsive-entity-page flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-y-2 pb-3 shrink-0 border-b border-gray-200 mb-0">
        <SettingsPageTitle
          title="Team Members"
          description={view === "table" ? "Compare team members, filter columns, and select a name to edit." : "Pick a member in the list to edit their details in the detail panel."}
        />
        <div className="flex flex-wrap items-center gap-2">
          <EntityViewToggle value={view} onChange={setView} label="Team" />
          {checkedIds.length > 0 && (
            <Button
              danger
              icon={<Trash2 size={15} />}
              onClick={handleBulkDelete}
              id="team-bulk-delete-btn"
            >
              Delete ({checkedIds.length})
            </Button>
          )}
          <Button
            type="text"
            aria-label="Export team members"
            data-tip="Export team members"
            className="tip"
            icon={<Download size={18} />}
            loading={isExporting}
            onClick={handleExport}
            id="team-export-btn"
          />
          <Button
            type="text"
            aria-label="Import team members"
            data-tip="Import team members"
            className="tip"
            icon={<Upload size={18} />}
            onClick={() => setBulkModalOpen(true)}
            id="team-bulk-import-btn"
          />
          <Button
            type="primary"
            icon={<Plus size={15} />}
            onClick={() => setAddModalOpen(true)}
            id="team-add-member-btn"
          >
            Add Team Member
          </Button>
        </div>
      </div>

      {/* ── Split layout ─────────────────────────────────────────── */}
      <EntityRecordTable<Team>
        active={view === "table"}
        label="Team members"
        records={teams}
        columns={tableColumns}
        checkedIds={checkedIds}
        onCheckedIdsChange={setCheckedIds}
        onOpenRecord={openTableRecord}
        customFieldEntity="team_member"
      />
      <div className={view === "form" ? "contents" : "hidden"}>
      <div data-detail-open={mobileDetailOpen} className="responsive-entity-split flex min-h-0 min-w-0 overflow-hidden gap-0 flex-1">
        {/* LEFT — Searchable card list */}
        <div className="responsive-entity-list w-[280px] min-w-[280px] flex flex-col bg-[#F3F6F4] overflow-hidden">
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 text-gray-400 pointer-events-none z-10" size={14} />
              <input
                className="w-full h-8 pl-8 pr-2.5 border border-transparent text-[13px] bg-white text-[#12211A] outline-none transition focus:border-[#0B5D3B] placeholder:text-[#626E67] rounded-none"
                placeholder="Search members…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="team-search-input"
                aria-label="Search team members"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between px-3 py-1.5">
              {/* Information only: how many people, and how many of them are switched off. */}
              <p className="text-xs text-[#626E67] m-0 tabular-nums">
                {search.trim() ? `${filtered.length} of ${teams.length}` : teams.length} member{teams.length !== 1 ? "s" : ""}
                {inactiveCount > 0 && <span> · {inactiveCount} inactive</span>}
              </p>
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-medium text-[#12211A] underline decoration-[#9AA8A0] underline-offset-4 hover:decoration-[#12211A] cursor-pointer bg-transparent border-none p-0"
                >
                  {checkedIds.length === filtered.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="p-5 text-center text-xs text-[#626E67]">No team members match this search.</div>
            ) : (
              filtered.map((team) => (
                <TeamMemberCard
                  key={team.id}
                  team={team}
                  isSelected={selectedTeam?.id === team.id}
                  isChecked={checkedIds.includes(team.id)}
                  onToggleCheck={() => toggleCheck(team.id)}
                  onClick={() => { setSelectedTeam(team); setMobileDetailOpen(true); }}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Detail / form panel */}
        <div className="responsive-entity-detail flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-white">
          <button type="button" className="entity-back" onClick={() => setMobileDetailOpen(false)}>← Back to list</button>
          {selectedTeam ? (
            <>
              {/* Detail header */}
              <div className="flex items-center gap-3 py-3 px-5 border-b border-[#D5DCD8] shrink-0 bg-white">
                <div className="w-10 h-10 bg-[#F3F6F4] text-[#12211A] flex items-center justify-center text-sm font-medium shrink-0 rounded-none">
                  {getInitials(selectedTeam.name)}
                </div>
                <div>
                  <div className="text-lg font-medium tracking-[-0.01em] text-[#12211A] leading-tight">{selectedTeam.name}</div>
                  <div className="text-xs text-[#626E67] mt-0.5">
                    {[
                      selectedTeam.role_type
                        ? selectedTeam.role_type.charAt(0).toUpperCase() +
                          selectedTeam.role_type.slice(1)
                        : null,
                      selectedTeam.status
                        ? selectedTeam.status.charAt(0).toUpperCase() +
                          selectedTeam.status.slice(1)
                        : null,
                      `ID ${selectedTeam.id}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>

                {/* TOP HEADER ACTION */}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="primary"
                    loading={isLoading}
                    htmlType="submit"
                    form={`team-member-${selectedTeam.id}`}
                    id="team-top-save-btn"
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* Form area */}
              <div className="flex-1 overflow-y-auto p-4 px-5 custom-scrollbar">
                <TeamMemberForm
                  key={selectedTeam.id}
                  initialData={selectedTeam}
                  isInline
                  onSubmit={() => {
                    /* stay on entity after save */
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-10">
              <div className="flex items-center justify-center text-[#9AA8A0]">
                <Users size={28} />
              </div>
              <p className="text-sm text-gray-400 text-center max-w-[240px]">
                Select a team member in the list to view and edit their details.
              </p>
            </div>
          )}
        </div>
      </div>

      </div>

      {/* Add modal */}
      <AddTeamMemberModal open={addModalOpen} setOpen={setAddModalOpen} />

      {/* Bulk import modal */}
      <BulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        entityType="driver"
      />
    </div>
  );
};

export default TeamList;
