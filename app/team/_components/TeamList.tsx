"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Spin, Form, Modal, message } from "antd";
import { Search, Users, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Team } from "@/types/team.type";
import { useTeamStore } from "@/store/team.store";
import TeamMemberForm from "./TeamMemberForm";
import AddTeamMemberModal from "./AddTeamMemberModal";
import TeamMemberCard from "./TeamMemberCard";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";

const TeamList = () => {
  const { isLoading, teams, bulkDeleteTeamsAction } = useTeamStore();
  const [form] = Form.useForm();

  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [search, setSearch] = useState("");

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
    if (!q) return teams;
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, search]);

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
          message.error(err?.message || "Failed to delete team members");
        }
      },
    });
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  if (isLoading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 shrink-0 border-b border-gray-200 mb-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900 m-0">Team Members</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick a member on the left to edit their details on the right.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            icon={<FileSpreadsheet size={15} />}
            onClick={() => setBulkModalOpen(true)}
            id="team-bulk-import-btn"
          >
            Bulk Import
          </Button>
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
      <div className="flex h-full overflow-hidden gap-0 flex-1">
        {/* LEFT — Searchable card list */}
        <div className="w-[280px] min-w-[280px] flex flex-col border-r border-gray-200 bg-gray-50/70 overflow-hidden">
          <div className="p-3 pb-2 border-b border-gray-200 bg-gray-50/70 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 text-gray-400 pointer-events-none z-10" size={14} />
              <input
                className="w-full py-1.5 pl-8 pr-2.5 border border-gray-200 text-xs bg-white text-gray-900 outline-none transition focus:border-[#003220] focus:ring-2 focus:ring-[#003220]/10 placeholder:text-gray-400 rounded-none"
                placeholder="Search members…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="team-search-input"
                aria-label="Search team members"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-[11px] font-semibold text-gray-400 tracking-wider uppercase m-0">
                {filtered.length} member{filtered.length !== 1 ? "s" : ""}
              </p>
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[11px] font-medium text-[#003220] hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  {checkedIds.length === filtered.length ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="p-5 text-center text-xs text-gray-400">No members match your search.</div>
            ) : (
              filtered.map((team) => (
                <TeamMemberCard
                  key={team.id}
                  team={team}
                  isSelected={selectedTeam?.id === team.id}
                  isChecked={checkedIds.includes(team.id)}
                  onToggleCheck={() => toggleCheck(team.id)}
                  onClick={() => setSelectedTeam(team)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Detail / form panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
          {selectedTeam ? (
            <>
              {/* Detail header */}
              <div className="flex items-center gap-3 p-3.5 px-5 border-b border-gray-200 shrink-0 bg-white">
                <div className="w-11 h-11 bg-primary text-white flex items-center justify-center text-base font-bold shrink-0 rounded-none">
                  {getInitials(selectedTeam.name)}
                </div>
                <div>
                  <div className="text-[17px] font-bold text-gray-900 leading-tight">{selectedTeam.name}</div>
                  <div className="text-[12.5px] text-gray-500 mt-0.5">
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
                    onClick={() => form.submit()}
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
                  form={form}
                  onSubmit={() => {
                    /* stay on entity after save */
                  }}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-10">
              <div className="w-14 h-14 bg-slate-100 flex items-center justify-center text-slate-300 rounded-none">
                <Users size={28} />
              </div>
              <p className="text-sm text-gray-400 text-center max-w-[240px]">
                Select a team member on the left to view and edit their details.
              </p>
            </div>
          )}
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
