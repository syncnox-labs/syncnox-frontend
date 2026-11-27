"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Button, Spin, Modal, message } from "antd";
import { Search, Truck, Upload, Plus, Trash2, Download } from "lucide-react";
import { Vehicle } from "@/types/vehicle.type";
import { useVehicleStore } from "@/store/vehicle.store";
import { exportVehicles } from "@/apis/vehicle.api";
import { generateVehiclesCsv, triggerDownload } from "@/utils/exportCsv.utils";
import AddVehicleModal from "./AddVehicleModal";
import VehicleForm from "./VehicleForm";
import VehicleCard from "./VehicleCard";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";
import EntityViewToggle from "@/components/Settings/EntityViewToggle";
import { useSettingsViewStore } from "@/store/settings-view.store";
import EntityRecordTable from "@/components/Settings/EntityRecordTable";
import SettingsPageTitle from "@/components/Settings/SettingsPageTitle";
import { createVehicleSettingsColumns } from "@/utils/settingsTable.columns";
import { useTeamStore } from "@/store/team.store";

function formatType(type: string | null): string {
  if (!type) return "";
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const VehicleList = () => {
  const { isLoading, vehicles, bulkDeleteVehiclesAction } = useVehicleStore();

  const view = useSettingsViewStore(state => state.view);
  const setView = useSettingsViewStore(state => state.setView);
  const { teams } = useTeamStore();
  const tableColumns = useMemo(() => createVehicleSettingsColumns(vehicles, teams), [vehicles, teams]);

  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const openTableRecord = useCallback((record: Vehicle) => {
    setSelectedVehicle(record);
    setMobileDetailOpen(true);
    setView("form");
  }, [setView]);

  // Auto-select first vehicle
  useEffect(() => {
    if (!selectedVehicle && vehicles.length > 0) {
      setSelectedVehicle(vehicles[0]);
    }
  }, [vehicles]);

  // Keep selection fresh
  useEffect(() => {
    if (selectedVehicle) {
      const fresh = vehicles.find((v) => v.id === selectedVehicle.id);
      if (fresh) {
        setSelectedVehicle(fresh);
      } else if (vehicles.length > 0) {
        setSelectedVehicle(vehicles[0]);
      } else {
        setSelectedVehicle(null);
      }
    }
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => !q || v.name.toLowerCase().includes(q));
  }, [vehicles, search]);

  const noDriverCount = useMemo(() => vehicles.filter((v) => !v.team_member_id).length, [vehicles]);

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (checkedIds.length === filtered.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(filtered.map((v) => v.id));
    }
  };

  const handleBulkDelete = () => {
    if (checkedIds.length === 0) return;

    Modal.confirm({
      title: "Bulk Delete Vehicles",
      content: `Are you sure you want to delete ${checkedIds.length} vehicle(s)? This action cannot be undone.`,
      okText: "Delete All",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await bulkDeleteVehiclesAction(checkedIds);
          message.success(`${checkedIds.length} vehicle(s) deleted`);
          setCheckedIds([]);
        } catch (err: any) {
          message.error(err?.message || "Failed to delete vehicles");
        }
      },
    });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const count = vehicles.length;

      try {
        await exportVehicles();
      } catch (apiErr) {
        // Fallback to client-side CSV generation if backend endpoint is unavailable
        const csv = generateVehiclesCsv(vehicles);
        triggerDownload("vehicles_export.csv", csv);
      }
      message.success(`Successfully exported ${count} vehicle(s) to CSV`);
    } catch (err: any) {
      message.error(err?.message || "Failed to export vehicles");
    } finally {
      setIsExporting(false);
    }
  };

  // Keep open dialogs mounted while the first create/import request is running.
  if (isLoading && vehicles.length === 0 && !addModalOpen && !bulkModalOpen) {
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
          title="Vehicles"
          description={view === "table" ? "Compare vehicles, filter columns, and select a name to edit." : "Pick a vehicle in the list to edit it. Alerts show on the tab so nothing important is hidden."}
        />
        <div className="flex flex-wrap items-center gap-2">
          <EntityViewToggle value={view} onChange={setView} label="Vehicle" />
          {checkedIds.length > 0 && (
            <Button
              danger
              icon={<Trash2 size={15} />}
              onClick={handleBulkDelete}
              id="vehicle-bulk-delete-btn"
            >
              Delete ({checkedIds.length})
            </Button>
          )}
          <Button
            type="text"
            aria-label="Export vehicles"
            data-tip="Export vehicles"
            className="tip"
            icon={<Download size={18} />}
            loading={isExporting}
            onClick={handleExport}
            id="vehicle-export-btn"
          />
          <Button
            type="text"
            aria-label="Import vehicles"
            data-tip="Import vehicles"
            className="tip"
            icon={<Upload size={18} />}
            onClick={() => setBulkModalOpen(true)}
            id="vehicle-bulk-import-btn"
          />
          <Button
            type="primary"
            icon={<Plus size={15} />}
            onClick={() => setAddModalOpen(true)}
            id="vehicle-add-btn"
          >
            Add Vehicle
          </Button>
        </div>
      </div>

      {/* ── Split layout ─────────────────────────────────────────── */}
      <EntityRecordTable<Vehicle>
        active={view === "table"}
        label="Vehicles"
        records={vehicles}
        columns={tableColumns}
        checkedIds={checkedIds}
        onCheckedIdsChange={setCheckedIds}
        onOpenRecord={openTableRecord}
        customFieldEntity="vehicle"
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
                placeholder="Search vehicles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="vehicle-search-input"
                aria-label="Search vehicles"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between px-3 py-1.5">
              {/* Information only: how many vehicles, and how many have nobody assigned to drive them. */}
              <p className="text-xs text-[#626E67] m-0 tabular-nums">
                {search.trim() ? `${filtered.length} of ${vehicles.length}` : vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
                {noDriverCount > 0 && <span title="Plans can still give these vehicles to a driver trip by trip"> · {noDriverCount} without a regular driver</span>}
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
              <div className="p-5 text-center text-xs text-[#626E67]">No vehicles match this search.</div>
            ) : (
              filtered.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  isSelected={selectedVehicle?.id === vehicle.id}
                  isChecked={checkedIds.includes(vehicle.id)}
                  onToggleCheck={() => toggleCheck(vehicle.id)}
                  onClick={() => { setSelectedVehicle(vehicle); setMobileDetailOpen(true); }}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Detail / form panel */}
        <div className="responsive-entity-detail flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-white">
          <button type="button" className="entity-back" onClick={() => setMobileDetailOpen(false)}>← Back to list</button>
          {selectedVehicle ? (
            <>
              {/* Detail header */}
              <div className="flex items-center gap-3 py-3 px-5 border-b border-[#D5DCD8] shrink-0 bg-white">
                <div className="w-10 h-10 bg-[#F1F2F4] flex items-center justify-center text-[#4A5750] shrink-0 rounded-none">
                  <Truck size={22} />
                </div>
                <div>
                  <div className="text-lg font-medium tracking-[-0.01em] text-[#12211A] leading-tight">{selectedVehicle.name}</div>
                  <div className="text-[12.5px] text-gray-500 mt-0.5">
                    {[
                      formatType(selectedVehicle.type),
                      selectedVehicle.license_plate,
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
                    form={`vehicle-${selectedVehicle.id}`}
                    id="vehicle-top-save-btn"
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* Form area */}
              <div className="flex-1 overflow-y-auto p-4 px-5 custom-scrollbar">
                <VehicleForm
                  key={selectedVehicle.id}
                  initialData={selectedVehicle}
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
                <Truck size={28} />
              </div>
              <p className="text-sm text-gray-400 text-center max-w-[240px]">
                Select a vehicle in the list to view and edit its details.
              </p>
            </div>
          )}
        </div>
      </div>

      </div>

      {/* Add modal */}
      <AddVehicleModal open={addModalOpen} setOpen={setAddModalOpen} />

      {/* Bulk import modal */}
      <BulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        entityType="vehicle"
      />
    </div>
  );
};

export default VehicleList;
