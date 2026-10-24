"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Spin, Modal, message, Popconfirm } from "antd";
import { Search, MapPin, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useLocationMappingStore } from "@/store/location-mapping.store";
import { LocationMapping } from "@/apis/location-mapping.api";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";
import AddLocationMappingModal from "./AddLocationMappingModal";
import LocationMappingCard from "./LocationMappingCard";
import LocationMappingForm from "./LocationMappingForm";

export default function LocationMappingList() {
  const {
    locationMappings,
    isLoading,
    isSaving,
    hasFetched,
    fetchLocationMappings,
    deleteLocationMapping,
    bulkDeleteLocationMappings,
  } = useLocationMappingStore();

  const [selectedMapping, setSelectedMapping] = useState<LocationMapping | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchLocationMappings();
  }, [fetchLocationMappings]);

  // Auto-select first mapping on initial load
  useEffect(() => {
    if (locationMappings.length > 0) {
      setSelectedMapping((prev) => prev ?? locationMappings[0]);
    }
  }, [locationMappings]);

  // Keep selection fresh after updates / deletes
  useEffect(() => {
    if (!selectedMapping) return;
    const fresh = locationMappings.find((m) => m.id === selectedMapping.id);
    if (fresh) {
      setSelectedMapping(fresh);
    } else if (locationMappings.length > 0) {
      setSelectedMapping(locationMappings[0]);
    } else {
      setSelectedMapping(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationMappings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locationMappings;
    return locationMappings.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.address && item.address.toLowerCase().includes(q)) ||
        (item.city && item.city.toLowerCase().includes(q)) ||
        (item.aliases && item.aliases.some((a) => a.toLowerCase().includes(q)))
    );
  }, [locationMappings, search]);

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (checkedIds.length === filtered.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(filtered.map((m) => m.id));
    }
  };

  const handleBulkDelete = () => {
    if (checkedIds.length === 0) return;

    Modal.confirm({
      title: "Bulk Delete Location Mappings",
      content: `Are you sure you want to delete ${checkedIds.length} location mapping(s)? This action cannot be undone.`,
      okText: "Delete All",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        const success = await bulkDeleteLocationMappings(checkedIds);
        if (success) {
          message.success(`${checkedIds.length} mapping(s) deleted`);
          setCheckedIds([]);
        } else {
          message.error("Failed to delete mappings");
        }
      },
    });
  };

  const handleSingleDelete = (mapping: LocationMapping) => {
    Modal.confirm({
      title: "Delete Location Mapping",
      content: `Are you sure you want to delete \"${mapping.name}\"? This action cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        const ok = await deleteLocationMapping(mapping.id);
        if (ok) {
          message.success("Mapping deleted");
        } else {
          message.error("Failed to delete mapping");
        }
      },
    });
  };

  // Only show the full-page loader on the very first load. Using `hasFetched`
  // (instead of `locationMappings.length === 0`) ensures a background refetch
  // after actions never unmounts this subtree — unmounting the page while a
  // modal (e.g. bulk import) is open would reset the modal and make it appear
  // to re-open.
  if (isLoading && !hasFetched && !isSaving) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between pb-3 shrink-0 border-b border-gray-200 mb-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900 m-0">Location Mappings</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick a location on the left to view and edit its reference details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {checkedIds.length > 0 && (
            <Button
              danger
              icon={<Trash2 size={15} />}
              onClick={handleBulkDelete}
              id="location-bulk-delete-btn"
            >
              Delete ({checkedIds.length})
            </Button>
          )}
          <Button
            icon={<FileSpreadsheet size={15} />}
            onClick={() => setBulkModalOpen(true)}
            id="location-bulk-import-btn"
          >
            Bulk Import
          </Button>
          <Button
            type="primary"
            icon={<Plus size={15} />}
            onClick={() => setAddModalOpen(true)}
            id="location-add-btn"
          >
            Add Mapping
          </Button>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex h-full overflow-hidden gap-0 flex-1">
        {/* LEFT searchable card list */}
        <div className="w-[280px] min-w-[280px] flex flex-col border-r border-gray-200 bg-gray-50/70 overflow-hidden">
          <div className="p-3 pb-2 border-b border-gray-200 bg-gray-50/70 shrink-0">
            <div className="relative flex items-center">
              <Search
                className="absolute left-2.5 text-gray-400 pointer-events-none z-10"
                size={14}
              />
              <input
                className="w-full py-1.5 pl-8 pr-2.5 border border-gray-200 text-xs bg-white text-gray-900 outline-none transition focus:border-[#003220] focus:ring-2 focus:ring-[#003220]/10 placeholder:text-gray-400 rounded-none"
                placeholder="Search locations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="location-search-input"
                aria-label="Search locations"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-[11px] font-semibold text-gray-400 tracking-wider uppercase m-0">
                {filtered.length} location{filtered.length !== 1 ? "s" : ""}
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
              <div className="p-5 text-center text-xs text-gray-400">
                No locations match your search.
              </div>
            ) : (
              filtered.map((mapping) => (
                <LocationMappingCard
                  key={mapping.id}
                  mapping={mapping}
                  isSelected={selectedMapping?.id === mapping.id}
                  isChecked={checkedIds.includes(mapping.id)}
                  onToggleCheck={() => toggleCheck(mapping.id)}
                  onClick={() => setSelectedMapping(mapping)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT detail / form panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
          {selectedMapping ? (
            <>
              <div className="flex items-center gap-3 p-3.5 px-5 border-b border-gray-200 shrink-0 bg-white">
                <div className="w-11 h-11 bg-slate-100 flex items-center justify-center text-[#003220] shrink-0 rounded-none">
                  <MapPin size={22} />
                </div>
                <div>
                  <div className="text-[17px] font-bold text-gray-900 leading-tight">
                    {selectedMapping.name}
                  </div>
                  <div className="text-[12.5px] text-gray-500 mt-0.5">
                    {[selectedMapping.address, selectedMapping.city]
                      .filter(Boolean)
                      .join(" · ") || "No address set"}
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <Popconfirm
                    title="Delete this mapping?"
                    onConfirm={() => handleSingleDelete(selectedMapping)}
                  >
                    <Button
                      danger
                      icon={<Trash2 size={15} />}
                      id="location-detail-delete-btn"
                    />
                  </Popconfirm>
                  <Button
                    type="primary"
                    loading={isSaving}
                    htmlType="submit"
                    form={`location-mapping-${selectedMapping.id}`}
                    id="location-top-save-btn"
                  >
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 px-5 custom-scrollbar">
                <LocationMappingForm
                  key={selectedMapping.id}
                  initialData={selectedMapping}
                  isInline
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-10">
              <div className="w-14 h-14 bg-slate-100 flex items-center justify-center text-slate-300 rounded-none">
                <MapPin size={28} />
              </div>
              <p className="text-sm text-gray-400 text-center max-w-[240px]">
                Select a location on the left to view and edit its details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add modal */}
      <AddLocationMappingModal open={addModalOpen} setOpen={setAddModalOpen} />

      {/* Bulk import modal */}
      <BulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        entityType="location"
      />
    </div>
  );
}
