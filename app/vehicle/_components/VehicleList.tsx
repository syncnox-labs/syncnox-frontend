"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Spin, Modal, Dropdown, message } from "antd";
import { Search, Truck, FileSpreadsheet, Plus, Trash2, Download } from "lucide-react";
import { Vehicle } from "@/types/vehicle.type";
import { useVehicleStore } from "@/store/vehicle.store";
import { exportVehicles } from "@/apis/vehicle.api";
import { generateVehiclesCsv, triggerDownload } from "@/utils/exportCsv.utils";
import AddVehicleModal from "./AddVehicleModal";
import VehicleForm from "./VehicleForm";
import VehicleCard from "./VehicleCard";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";

function formatType(type: string | null): string {
  if (!type) return "";
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const VehicleList = () => {
  const { isLoading, vehicles, bulkDeleteVehiclesAction } = useVehicleStore();

  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [isExporting, setIsExporting] = useState(false);

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
    if (!q) return vehicles;
    return vehicles.filter((v) => v.name.toLowerCase().includes(q));
  }, [vehicles, search]);

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

  const handleExport = async (selectedOnly: boolean = false) => {
    try {
      setIsExporting(true);
      const targetIds = selectedOnly && checkedIds.length > 0 ? checkedIds : undefined;
      const count = targetIds ? targetIds.length : vehicles.length;

      try {
        await exportVehicles(targetIds);
      } catch (apiErr) {
        // Fallback to client-side CSV generation if backend endpoint is unavailable
        const vehiclesToExport = targetIds
          ? vehicles.filter((v) => targetIds.includes(v.id))
          : vehicles;
        const csv = generateVehiclesCsv(vehiclesToExport);
        triggerDownload(
          targetIds ? `vehicles_selected_${targetIds.length}.csv` : "vehicles_export.csv",
          csv
        );
      }
      message.success(`Successfully exported ${count} vehicle(s) to CSV`);
    } catch (err: any) {
      message.error(err?.message || "Failed to export vehicles");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading && vehicles.length === 0) {
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
          <h1 className="text-lg font-bold text-gray-900 m-0">Vehicles</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick a vehicle on the left to edit it. Alerts show on the tab so nothing important is hidden.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {checkedIds.length > 0 ? (
            <Dropdown
              menu={{
                items: [
                  {
                    key: "selected",
                    label: `Export Selected (${checkedIds.length})`,
                    onClick: () => handleExport(true),
                  },
                  {
                    key: "all",
                    label: `Export All (${vehicles.length})`,
                    onClick: () => handleExport(false),
                  },
                ],
              }}
            >
              <Button
                icon={<Download size={15} />}
                loading={isExporting}
                id="vehicle-export-btn"
              >
                Export ({checkedIds.length})
              </Button>
            </Dropdown>
          ) : (
            <Button
              icon={<Download size={15} />}
              loading={isExporting}
              onClick={() => handleExport(false)}
              id="vehicle-export-btn"
            >
              Export CSV
            </Button>
          )}
          <Button
            icon={<FileSpreadsheet size={15} />}
            onClick={() => setBulkModalOpen(true)}
            id="vehicle-bulk-import-btn"
          >
            Bulk Import
          </Button>
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
      <div className="flex h-full overflow-hidden gap-0 flex-1">
        {/* LEFT — Searchable card list */}
        <div className="w-[280px] min-w-[280px] flex flex-col border-r border-gray-200 bg-gray-50/70 overflow-hidden">
          <div className="p-3 pb-2 border-b border-gray-200 bg-gray-50/70 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 text-gray-400 pointer-events-none z-10" size={14} />
              <input
                className="w-full py-1.5 pl-8 pr-2.5 border border-gray-200 text-xs bg-white text-gray-900 outline-none transition focus:border-[#003220] focus:ring-2 focus:ring-[#003220]/10 placeholder:text-gray-400 rounded-none"
                placeholder="Search vehicles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="vehicle-search-input"
                aria-label="Search vehicles"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-[11px] font-semibold text-gray-400 tracking-wider uppercase m-0">
                {filtered.length} vehicle{filtered.length !== 1 ? "s" : ""}
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
              <div className="p-5 text-center text-xs text-gray-400">No vehicles match your search.</div>
            ) : (
              filtered.map((vehicle) => (
                <VehicleCard
                  key={vehicle.id}
                  vehicle={vehicle}
                  isSelected={selectedVehicle?.id === vehicle.id}
                  isChecked={checkedIds.includes(vehicle.id)}
                  onToggleCheck={() => toggleCheck(vehicle.id)}
                  onClick={() => setSelectedVehicle(vehicle)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Detail / form panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
          {selectedVehicle ? (
            <>
              {/* Detail header */}
              <div className="flex items-center gap-3 p-3.5 px-5 border-b border-gray-200 shrink-0 bg-white">
                <div className="w-11 h-11 bg-slate-100 flex items-center justify-center text-[#003220] shrink-0 rounded-none">
                  <Truck size={22} />
                </div>
                <div>
                  <div className="text-[17px] font-bold text-gray-900 leading-tight">{selectedVehicle.name}</div>
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
              <div className="w-14 h-14 bg-slate-100 flex items-center justify-center text-slate-300 rounded-none">
                <Truck size={28} />
              </div>
              <p className="text-sm text-gray-400 text-center max-w-[240px]">
                Select a vehicle on the left to view and edit its details.
              </p>
            </div>
          )}
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
