"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Spin, Modal, message } from "antd";
import { Search, MapPin, Map, Plus, Trash2, Upload } from "lucide-react";
import { useDepotStore } from "@/store/depots.store";
import { Depot as DepotType } from "@/types/depots.type";
import DepotForm from "./DepotForm";
import DepotCard from "./DepotCard";
import CreateDepotModal from "./CreateDepotModal";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";
import { DepotPayload } from "@/apis/depots.api";
import { Panel, PanelGroup } from "react-resizable-panels";
import ResizeHandle from "@/components/ResizeHandle";
import GoogleMaps from "@/components/GoogleMaps";

const Depot = () => {
  const {
    depots,
    isSaving,
    isLoading,
    updateDepot,
    createDepot,
    bulkDeleteDepots,
    fetchDepots,
  } = useDepotStore();

  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedDepot, setSelectedDepot] = useState<DepotType | undefined>(
    undefined
  );
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Map state
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [selectedMarkerId, setSelectedMarkerId] = useState<
    number | string | null
  >(null);

  // Auto-select first depot
  useEffect(() => {
    if (!selectedDepot && depots.length > 0) {
      setSelectedDepot(depots[0]);
    }
  }, [depots]);

  // Keep selection fresh after updates and sync selectedMarkerId
  useEffect(() => {
    if (selectedDepot) {
      const fresh = depots.find((d) => d.id === selectedDepot.id);
      if (fresh) {
        setSelectedDepot(fresh);
      } else if (depots.length > 0) {
        setSelectedDepot(depots[0]);
      } else {
        setSelectedDepot(undefined);
      }
      setSelectedMarkerId(selectedDepot.id);
      if (selectedDepot.location?.lat && selectedDepot.location?.lng) {
        setMapCenter({
          lat: selectedDepot.location.lat,
          lng: selectedDepot.location.lng,
        });
      }
    } else {
      setSelectedMarkerId(null);
    }
  }, [depots, selectedDepot?.id]);

  const handleCreateSubmit = async (values: DepotPayload) => {
    const success = await createDepot(values);
    if (success) setIsCreateModalOpen(false);
    return success;
  };

  const handleEditSubmit = async (values: DepotPayload) => {
    if (!selectedDepot) return false;
    const success = await updateDepot(selectedDepot.id, values);
    return success;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return depots;
    return depots.filter((d) => d.name.toLowerCase().includes(q));
  }, [depots, search]);

  const toggleCheck = (id: number) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (checkedIds.length === filtered.length) {
      setCheckedIds([]);
    } else {
      setCheckedIds(filtered.map((d) => d.id));
    }
  };

  const handleBulkDelete = () => {
    if (checkedIds.length === 0) return;

    Modal.confirm({
      title: "Bulk Delete Depots",
      content: `Are you sure you want to delete ${checkedIds.length} depot(s)? This action cannot be undone.`,
      okText: "Delete All",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        const success = await bulkDeleteDepots(checkedIds);
        if (success) {
          message.success(`${checkedIds.length} depot(s) deleted`);
          setCheckedIds([]);
        } else {
          message.error("Failed to delete depots");
        }
      },
    });
  };

  const markers = depots
    .filter((d: DepotType) => d.location?.lat && d.location?.lng)
    .map((d: DepotType, index: number) => ({
      id: d.id,
      position: { lat: d.location.lat, lng: d.location.lng },
      description: d.address?.formatted_address || "No address",
      jobData: d as any,
      sequenceNumber: index + 1,
    }));

  if (isLoading && depots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  const splitContent = (
    <div className="responsive-entity-page flex flex-col h-full min-h-0 min-w-0 overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 shrink-0 border-b border-gray-200 mb-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900 m-0">Depots</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick a depot in the list to edit it. Drag the pin on the map to adjust its location.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {checkedIds.length > 0 && (
            <Button
              danger
              icon={<Trash2 size={15} />}
              onClick={handleBulkDelete}
              id="depot-bulk-delete-btn"
            >
              Delete ({checkedIds.length})
            </Button>
          )}
          <Button
            onClick={() => {
              if (!isMapOpen && selectedDepot) {
                setSelectedMarkerId(selectedDepot.id);
                if (selectedDepot.location?.lat && selectedDepot.location?.lng) {
                  setMapCenter({ lat: selectedDepot.location.lat, lng: selectedDepot.location.lng });
                }
              }
              setIsMapOpen(!isMapOpen);
            }}
            icon={<MapPin size={18} />}
            title={isMapOpen ? "Close Map" : "Map View"}
            id="depot-map-view-btn"
          />
          <Button
            type="primary"
            icon={<Plus size={15} />}
            onClick={() => setIsCreateModalOpen(true)}
            id="depot-add-btn"
          >
            Add Depot
          </Button>
        </div>
      </div>

      {/* ── Split layout ─────────────────────────────────────────── */}
      <div data-detail-open={mobileDetailOpen} className="responsive-entity-split flex min-h-0 min-w-0 overflow-hidden gap-0 flex-1">
        {/* LEFT — Searchable card list */}
        <div className="responsive-entity-list w-[280px] min-w-[280px] flex flex-col border-r border-gray-200 bg-gray-50/70 overflow-hidden">
          <div className="p-3 pb-2 border-b border-gray-200 bg-gray-50/70 shrink-0">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 text-gray-400 pointer-events-none z-10" size={14} />
              <input
                className="w-full py-1.5 pl-8 pr-2.5 border border-gray-200 text-xs bg-white text-gray-900 outline-none transition focus:border-[#003220] focus:ring-2 focus:ring-[#003220]/10 placeholder:text-gray-400 rounded-none"
                placeholder="Search depots…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                id="depot-search-input"
                aria-label="Search depots"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-[11px] font-semibold text-gray-400 tracking-wider uppercase m-0">
                {filtered.length} depot{filtered.length !== 1 ? "s" : ""}
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
              <div className="p-5 text-center text-xs text-gray-400">No depots match your search.</div>
            ) : (
              filtered.map((depot) => (
                <DepotCard
                  key={depot.id}
                  depot={depot}
                  isSelected={selectedDepot?.id === depot.id}
                  isChecked={checkedIds.includes(depot.id)}
                  onToggleCheck={() => toggleCheck(depot.id)}
                  onClick={() => {
                    setSelectedDepot(depot);
                    setMobileDetailOpen(true);
                    // If map is open, fly to this depot
                    if (isMapOpen && depot.location?.lat && depot.location?.lng) {
                      setMapCenter({ lat: depot.location.lat, lng: depot.location.lng });
                      setSelectedMarkerId(depot.id);
                    }
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT — Detail / form panel */}
        <div className="responsive-entity-detail flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-white">
          <button type="button" className="entity-back" onClick={() => setMobileDetailOpen(false)}>← Back to list</button>
          {selectedDepot ? (
            <>
              {/* Detail header */}
              <div className="flex items-center gap-3 border-b border-gray-200 shrink-0 bg-white">
                <div className="w-11 h-11 bg-slate-100 flex items-center justify-center text-[#003220] shrink-0 rounded-none">
                  <MapPin size={22} />
                </div>
                <div>
                  <div className="text-[17px] font-bold text-gray-900 leading-tight">{selectedDepot.name}</div>
                  <div className="text-[12.5px] text-gray-500 mt-0.5">
                    {selectedDepot.address?.formatted_address || "No address set"}
                  </div>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {selectedDepot.location?.lat && (
                    <button
                      className="text-xs text-[#003220] hover:underline cursor-pointer bg-transparent border-none p-0 mr-2"
                      onClick={() => {
                        setIsMapOpen(true);
                        setMapCenter({
                          lat: selectedDepot.location.lat,
                          lng: selectedDepot.location.lng,
                        });
                        setSelectedMarkerId(selectedDepot.id);
                      }}
                    >
                      View on map
                    </button>
                  )}
                </div>
              </div>

              {/* Form area */}
              <div className="flex-1 overflow-y-auto p-4 px-5 custom-scrollbar">
                <DepotForm
                  key={selectedDepot.id}
                  initialValues={selectedDepot}
                  onSubmit={handleEditSubmit}
                  isLoading={isSaving}
                  onCancel={() => {
                    /* stay on depot */
                  }}
                  existingDepots={depots}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-10">
              <div className="w-14 h-14 bg-slate-100 flex items-center justify-center text-slate-300 rounded-none">
                <MapPin size={28} />
              </div>
              <p className="text-sm text-gray-400 text-center max-w-[240px]">
                Select a depot in the list to view and edit its details.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create depot modal */}
      <CreateDepotModal
        open={isCreateModalOpen}
        setOpen={setIsCreateModalOpen}
        onSubmit={handleCreateSubmit}
        isLoading={isSaving}
        existingDepots={depots}
      />

    </div>
  );

  // When map is open, wrap with a vertical resizable panel
  return isMapOpen ? (
    <div className="flex flex-col h-full">
      <PanelGroup direction="vertical">
        <Panel defaultSize={35} minSize={15}>
          <div className="h-full">
            <GoogleMaps
              markers={markers}
              center={mapCenter || { lat: 40.7128, lng: -74.006 }}
              zoom={mapCenter ? 17 : 10}
              selectedMarkerId={selectedMarkerId}
              onMarkerSelect={(id) => {
                setSelectedMarkerId(id);
                const depot = depots.find((d) => d.id === id);
                if (depot) setSelectedDepot(depot);
              }}
              InfoWindowModal={({ marker }) => (
                <div className="p-2 min-w-[200px]">
                  <div className="font-semibold text-gray-800 mb-1">
                    {(marker.jobData as any).name}
                  </div>
                  <div className="text-sm text-gray-600">{marker.description}</div>
                  <button
                    className="text-sm text-blue-600 mt-2 underline"
                    onClick={() => setSelectedDepot(marker.jobData as any)}
                  >
                    Edit Depot
                  </button>
                </div>
              )}
            />
          </div>
        </Panel>
        <ResizeHandle />
        <Panel defaultSize={65} minSize={20}>
          <div className="pt-2 h-full overflow-hidden">{splitContent}</div>
        </Panel>
      </PanelGroup>
    </div>
  ) : (
    splitContent
  );
};

export default Depot;
