"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Spin, Modal, message, Form, Popconfirm } from "antd";
import {
  Search,
  MapPin,
  Plus,
  Trash2,
  FileSpreadsheet,
  Building,
} from "lucide-react";
import { useDepotStore } from "@/store/depots.store";
import { useLocationMappingStore } from "@/store/location-mapping.store";
import { Depot as DepotType } from "@/types/depots.type";
import {
  LocationMapping,
  LOCATION_TYPE_OPTIONS,
} from "@/apis/location-mapping.api";
import DepotForm from "@/app/depot/_components/DepotForm";
import DepotCard from "@/app/depot/_components/DepotCard";
import CreateDepotModal from "@/app/depot/_components/CreateDepotModal";
import LocationMappingCard from "@/app/location-mapping/_components/LocationMappingCard";
import LocationMappingForm from "@/app/location-mapping/_components/LocationMappingForm";
import AddLocationMappingModal from "@/app/location-mapping/_components/AddLocationMappingModal";
import BulkImportModal from "@/components/BulkImport/BulkImportModal";
import { DepotPayload } from "@/apis/depots.api";
import { useSearchParams, useRouter } from "next/navigation";

type LocationTab = "depots" | "additional-locations";

interface LocationsViewProps {
  defaultTab?: LocationTab;
}

export default function LocationsView({ defaultTab = "depots" }: LocationsViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabFromUrl = searchParams.get("tab") as LocationTab | null;
  const [activeTab, setActiveTab] = useState<LocationTab>(
    tabFromUrl || defaultTab
  );

  useEffect(() => {
    if (tabFromUrl && (tabFromUrl === "depots" || tabFromUrl === "additional-locations")) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const handleTabChange = (tab: LocationTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/locations?${params.toString()}`);
  };

  // ── Depots Store State ──────────────────────────────────────────────────
  const {
    depots,
    isSaving: isDepotSaving,
    isLoading: isDepotLoading,
    updateDepot,
    createDepot,
    bulkDeleteDepots,
    fetchDepots,
  } = useDepotStore();

  const [selectedDepot, setSelectedDepot] = useState<DepotType | undefined>(undefined);
  const [depotCheckedIds, setDepotCheckedIds] = useState<number[]>([]);
  const [isCreateDepotModalOpen, setIsCreateDepotModalOpen] = useState(false);
  const [depotSearch, setDepotSearch] = useState("");

  useEffect(() => {
    fetchDepots();
  }, [fetchDepots]);

  useEffect(() => {
    if (!selectedDepot && depots.length > 0) {
      setSelectedDepot(depots[0]);
    }
  }, [depots]);

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
    }
  }, [depots, selectedDepot?.id]);

  const filteredDepots = useMemo(() => {
    const q = depotSearch.trim().toLowerCase();
    if (!q) return depots;
    return depots.filter((d) => d.name.toLowerCase().includes(q));
  }, [depots, depotSearch]);

  const toggleDepotCheck = (id: number) => {
    setDepotCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllDepots = () => {
    if (depotCheckedIds.length === filteredDepots.length) {
      setDepotCheckedIds([]);
    } else {
      setDepotCheckedIds(filteredDepots.map((d) => d.id));
    }
  };

  const handleBulkDeleteDepots = () => {
    if (depotCheckedIds.length === 0) return;
    Modal.confirm({
      title: "Bulk Delete Depots",
      content: `Are you sure you want to delete ${depotCheckedIds.length} depot(s)? This action cannot be undone.`,
      okText: "Delete All",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        const success = await bulkDeleteDepots(depotCheckedIds);
        if (success) {
          message.success(`${depotCheckedIds.length} depot(s) deleted`);
          setDepotCheckedIds([]);
        } else {
          message.error("Failed to delete depots");
        }
      },
    });
  };

  const handleCreateDepotSubmit = async (values: DepotPayload) => {
    const success = await createDepot(values);
    if (success) setIsCreateDepotModalOpen(false);
    return success;
  };

  const handleEditDepotSubmit = async (values: DepotPayload) => {
    if (!selectedDepot) return false;
    const success = await updateDepot(selectedDepot.id, values);
    return success;
  };

  // ── Additional Locations Store State ─────────────────────────────────────
  const {
    locationMappings,
    locationTypes,
    isLoading: isLocationLoading,
    isSaving: isLocationSaving,
    fetchLocationMappings,
    fetchLocationTypes,
    deleteLocationMapping,
    bulkDeleteLocationMappings,
  } = useLocationMappingStore();

  const [locationForm] = Form.useForm();
  const [selectedMapping, setSelectedMapping] = useState<LocationMapping | null>(null);
  const [locationCheckedIds, setLocationCheckedIds] = useState<number[]>([]);
  const [addLocationModalOpen, setAddLocationModalOpen] = useState(false);
  const [bulkImportModalOpen, setBulkImportModalOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>("all");

  useEffect(() => {
    fetchLocationMappings();
    fetchLocationTypes();
  }, [fetchLocationMappings, fetchLocationTypes]);

  useEffect(() => {
    if (locationMappings.length > 0) {
      setSelectedMapping((prev) => prev ?? locationMappings[0]);
    }
  }, [locationMappings]);

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
  }, [locationMappings]);

  // All location type options including tenant custom types
  const allLocationTypeOptions = useMemo(() => {
    return [
      { label: "All", type: "all" },
      ...(locationTypes.length > 0 ? locationTypes : LOCATION_TYPE_OPTIONS).map((opt) => ({
        label: opt.label,
        type: opt.value,
      })),
    ];
  }, [locationTypes]);

  // Compute location type counts
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: locationMappings.length,
      metro_station: 0,
      customer_site: 0,
      end_customer: 0,
      pickup: 0,
      warehouse: 0,
      other: 0,
    };
    const allTypes = locationTypes.length > 0 ? locationTypes : LOCATION_TYPE_OPTIONS;
    allTypes.forEach((t) => {
      if (counts[t.value] === undefined) {
        counts[t.value] = 0;
      }
    });

    locationMappings.forEach((item) => {
      const raw = item.type || item.location_type || "metro_station";
      const matched = allTypes.find(
        (opt) =>
          opt.value.toLowerCase() === String(raw).toLowerCase() ||
          opt.label.toLowerCase() === String(raw).toLowerCase()
      );
      const key = matched ? matched.value : raw;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [locationMappings, locationTypes]);

  // Reset selectedTypeFilter to "all" if active filter has no items
  useEffect(() => {
    if (
      selectedTypeFilter !== "all" &&
      (!typeCounts[selectedTypeFilter] || typeCounts[selectedTypeFilter] === 0)
    ) {
      setSelectedTypeFilter("all");
    }
  }, [typeCounts, selectedTypeFilter]);

  const filteredLocations = useMemo(() => {
    let result = locationMappings;
    if (selectedTypeFilter !== "all") {
      result = result.filter((item) => {
        const raw = item.type || item.location_type || "metro_station";
        const allTypes = locationTypes.length > 0 ? locationTypes : LOCATION_TYPE_OPTIONS;
        const matched = allTypes.find(
          (opt) =>
            opt.value.toLowerCase() === String(raw).toLowerCase() ||
            opt.label.toLowerCase() === String(raw).toLowerCase()
        );
        const key = matched ? matched.value : raw;
        return key === selectedTypeFilter;
      });
    }
    const q = locationSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          (item.address && item.address.toLowerCase().includes(q)) ||
          (item.city && item.city.toLowerCase().includes(q)) ||
          (item.aliases && item.aliases.some((a) => a.toLowerCase().includes(q)))
      );
    }
    return result;
  }, [locationMappings, selectedTypeFilter, locationSearch]);

  const toggleLocationCheck = (id: number) => {
    setLocationCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllLocations = () => {
    if (locationCheckedIds.length === filteredLocations.length) {
      setLocationCheckedIds([]);
    } else {
      setLocationCheckedIds(filteredLocations.map((m) => m.id));
    }
  };

  const handleBulkDeleteLocations = () => {
    if (locationCheckedIds.length === 0) return;
    Modal.confirm({
      title: "Bulk Delete Additional Locations",
      content: `Are you sure you want to delete ${locationCheckedIds.length} location(s)? This action cannot be undone.`,
      okText: "Delete All",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        const success = await bulkDeleteLocationMappings(locationCheckedIds);
        if (success) {
          message.success(`${locationCheckedIds.length} location(s) deleted`);
          setLocationCheckedIds([]);
        } else {
          message.error("Failed to delete locations");
        }
      },
    });
  };

  const handleSingleDeleteLocation = (mapping: LocationMapping) => {
    Modal.confirm({
      title: "Delete Location",
      content: `Are you sure you want to delete "${mapping.name}"? This action cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        const ok = await deleteLocationMapping(mapping.id);
        if (ok) {
          message.success("Location deleted");
        } else {
          message.error("Failed to delete location");
        }
      },
    });
  };

  const isGlobalLoading =
    activeTab === "depots"
      ? isDepotLoading && depots.length === 0
      : isLocationLoading && locationMappings.length === 0;

  if (isGlobalLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden font-sans">
      {/* Top Header */}
      <div className="flex items-start justify-between pb-3 shrink-0 border-b border-gray-200">
        <div>
          <h1 className="text-xl font-bold text-gray-900 m-0">Locations</h1>
          <p className="text-xs text-gray-500 mt-1 m-0">
            {activeTab === "depots"
              ? "Your operational bases — where vehicles start, end and are stored. Pick one to edit."
              : "Every other place your routes touch — customer sites, end-customers, pickup points, hubs. One list, filter by type."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "depots" ? (
            <>
              {depotCheckedIds.length > 0 && (
                <Button
                  danger
                  icon={<Trash2 size={15} />}
                  onClick={handleBulkDeleteDepots}
                >
                  Delete ({depotCheckedIds.length})
                </Button>
              )}
              <Button
                type="primary"
                icon={<Plus size={15} />}
                onClick={() => setIsCreateDepotModalOpen(true)}
                className="bg-[#003220] hover:bg-[#002417]"
              >
                Add Depot
              </Button>
            </>
          ) : (
            <>
              {locationCheckedIds.length > 0 && (
                <Button
                  danger
                  icon={<Trash2 size={15} />}
                  onClick={handleBulkDeleteLocations}
                >
                  Delete ({locationCheckedIds.length})
                </Button>
              )}
              <Button
                icon={<FileSpreadsheet size={15} />}
                onClick={() => setBulkImportModalOpen(true)}
              >
                Bulk Import
              </Button>
              <Button
                type="primary"
                icon={<Plus size={15} />}
                onClick={() => setAddLocationModalOpen(true)}
                className="bg-[#003220] hover:bg-[#002417]"
              >
                Add Location
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs Navigation (Underline Style matching Jobs, Routes, Schedule & Custom Fields) */}
      <div className="flex border-b border-gray-200 my-3 space-x-6 shrink-0">
        <button
          type="button"
          onClick={() => handleTabChange("depots")}
          className={`pb-2.5 px-1 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer bg-transparent border-t-0 border-x-0 outline-none ${
            activeTab === "depots"
              ? "border-b-2 border-[#003220] text-[#003220] font-bold"
              : "border-b-2 border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Depots</span>
          <span
            className={`px-1.5 py-0.2 text-[10px] rounded font-bold ${
              activeTab === "depots"
                ? "bg-[#003220]/10 text-[#003220]"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {depots.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("additional-locations")}
          className={`pb-2.5 px-1 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer bg-transparent border-t-0 border-x-0 outline-none ${
            activeTab === "additional-locations"
              ? "border-b-2 border-[#003220] text-[#003220] font-bold"
              : "border-b-2 border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>Additional Locations</span>
          <span
            className={`px-1.5 py-0.2 text-[10px] rounded font-bold ${
              activeTab === "additional-locations"
                ? "bg-[#003220]/10 text-[#003220]"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {locationMappings.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Depots Split View */}
      {activeTab === "depots" && (
        <div className="flex h-full overflow-hidden gap-0 flex-1 mt-0">
          {/* Left card list */}
          <div className="w-[280px] min-w-[280px] flex flex-col border-r border-gray-200 bg-gray-50/70 overflow-hidden">
            <div className="p-3 pb-2 border-b border-gray-200 bg-gray-50/70 shrink-0">
              <div className="relative flex items-center">
                <Search
                  className="absolute left-2.5 text-gray-400 pointer-events-none z-10"
                  size={14}
                />
                <input
                  className="w-full py-1.5 pl-8 pr-2.5 border border-gray-200 text-xs bg-white text-gray-900 outline-none transition focus:border-[#003220] focus:ring-2 focus:ring-[#003220]/10 placeholder:text-gray-400"
                  placeholder="Search depots…"
                  value={depotSearch}
                  onChange={(e) => setDepotSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
              <div className="flex items-center justify-between px-1 mb-1.5">
                <p className="text-[11px] font-semibold text-gray-400 tracking-wider uppercase m-0">
                  {filteredDepots.length} depot{filteredDepots.length !== 1 ? "s" : ""}
                </p>
                {filteredDepots.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllDepots}
                    className="text-[11px] font-medium text-[#003220] hover:underline cursor-pointer bg-transparent border-none p-0"
                  >
                    {depotCheckedIds.length === filteredDepots.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                )}
              </div>

              {filteredDepots.length === 0 ? (
                <div className="p-5 text-center text-xs text-gray-400">
                  No depots match your search.
                </div>
              ) : (
                filteredDepots.map((depot) => (
                  <DepotCard
                    key={depot.id}
                    depot={depot}
                    isSelected={selectedDepot?.id === depot.id}
                    isChecked={depotCheckedIds.includes(depot.id)}
                    onToggleCheck={() => toggleDepotCheck(depot.id)}
                    onClick={() => {
                      setSelectedDepot(depot);
                    }}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right detail panel */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
            {selectedDepot ? (
              <>
                <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 shrink-0 bg-white">
                  <div className="w-10 h-10 bg-slate-100 flex items-center justify-center text-[#003220] shrink-0">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-gray-900 leading-tight">
                        {selectedDepot.name}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-[#003220] rounded">
                        Depot
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {selectedDepot.address?.formatted_address || "No address set"}
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 px-5 custom-scrollbar">
                  <DepotForm
                    key={selectedDepot.id}
                    initialValues={selectedDepot}
                    onSubmit={handleEditDepotSubmit}
                    isLoading={isDepotSaving}
                    onCancel={() => {}}
                    existingDepots={depots}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-10">
                <div className="w-12 h-12 bg-slate-100 flex items-center justify-center text-slate-300">
                  <MapPin size={24} />
                </div>
                <p className="text-xs text-gray-400 text-center max-w-[240px]">
                  Select a depot on the left to view and edit its details.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Additional Locations View */}
      {activeTab === "additional-locations" && (
        <div className="flex flex-col h-full overflow-hidden flex-1 mt-0">
          {/* Category / Type filter chips (Only show chips if location type exists) */}
          <div className="flex items-center justify-between py-2 px-1 border-b border-gray-200 shrink-0 bg-white">
            <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
              {allLocationTypeOptions
                .filter(({ type }) => type === "all" || (typeCounts[type] && typeCounts[type] > 0))
                .map(({ label, type }) => {
                  const count = typeCounts[type] || 0;
                  const isSelected = selectedTypeFilter === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSelectedTypeFilter(type)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition-all cursor-pointer outline-none border ${
                        isSelected
                          ? "bg-[#003220] text-white border-[#003220] font-medium"
                          : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                      }`}
                    >
                      <span>{label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                          isSelected
                            ? "bg-white/20 text-white"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Split View for Additional Locations */}
          <div className="flex h-full overflow-hidden gap-0 flex-1">
            {/* Left card list */}
            <div className="w-[280px] min-w-[280px] flex flex-col border-r border-gray-200 bg-gray-50/70 overflow-hidden">
              <div className="p-3 pb-2 border-b border-gray-200 bg-gray-50/70 shrink-0">
                <div className="relative flex items-center">
                  <Search
                    className="absolute left-2.5 text-gray-400 pointer-events-none z-10"
                    size={14}
                  />
                  <input
                    className="w-full py-1.5 pl-8 pr-2.5 border border-gray-200 text-xs bg-white text-gray-900 outline-none transition focus:border-[#003220] focus:ring-2 focus:ring-[#003220]/10 placeholder:text-gray-400"
                    placeholder="Search locations…"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <p className="text-[11px] font-semibold text-gray-400 tracking-wider uppercase m-0">
                    {filteredLocations.length} location
                    {filteredLocations.length !== 1 ? "s" : ""}
                  </p>
                  {filteredLocations.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllLocations}
                      className="text-[11px] font-medium text-[#003220] hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      {locationCheckedIds.length === filteredLocations.length
                        ? "Deselect all"
                        : "Select all"}
                    </button>
                  )}
                </div>

                {filteredLocations.length === 0 ? (
                  <div className="p-5 text-center text-xs text-gray-400">
                    No locations match your filter.
                  </div>
                ) : (
                  filteredLocations.map((mapping) => (
                    <LocationMappingCard
                      key={mapping.id}
                      mapping={mapping}
                      isSelected={selectedMapping?.id === mapping.id}
                      isChecked={locationCheckedIds.includes(mapping.id)}
                      onToggleCheck={() => toggleLocationCheck(mapping.id)}
                      onClick={() => {
                        setSelectedMapping(mapping);
                      }}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Right detail form matching Depots structure */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
              {selectedMapping ? (
                <>
                  <div className="flex items-center gap-3 p-3.5 px-5 border-b border-gray-200 shrink-0 bg-white">
                    <div className="w-10 h-10 bg-slate-100 flex items-center justify-center text-[#003220] shrink-0">
                      <MapPin size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-gray-900 leading-tight">
                          {selectedMapping.name}
                        </span>
                        {(() => {
                          const raw = selectedMapping.type || selectedMapping.location_type || "metro_station";
                          const allTypes = locationTypes.length > 0 ? locationTypes : LOCATION_TYPE_OPTIONS;
                          const matched = allTypes.find(
                            (opt) => opt.value.toLowerCase() === String(raw).toLowerCase() || opt.label.toLowerCase() === String(raw).toLowerCase()
                          );
                          const label = matched ? matched.label : String(raw).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                          return label ? (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-800 rounded">
                              {label}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[selectedMapping.address, selectedMapping.city]
                          .filter(Boolean)
                          .join(" · ") || "No address set"}
                      </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      <Popconfirm
                        title="Delete this location?"
                        onConfirm={() => handleSingleDeleteLocation(selectedMapping)}
                      >
                        <Button danger icon={<Trash2 size={15} />} />
                      </Popconfirm>
                      <Button
                        type="primary"
                        loading={isLocationSaving}
                        onClick={() => locationForm.submit()}
                        className="bg-[#003220] hover:bg-[#002417]"
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
                      form={locationForm}
                      existingLocations={locationMappings}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3 p-10">
                  <div className="w-12 h-12 bg-slate-100 flex items-center justify-center text-slate-300">
                    <MapPin size={24} />
                  </div>
                  <p className="text-xs text-gray-400 text-center max-w-[240px]">
                    Select a location on the left to view and edit its details.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateDepotModal
        open={isCreateDepotModalOpen}
        setOpen={setIsCreateDepotModalOpen}
        onSubmit={handleCreateDepotSubmit}
        isLoading={isDepotSaving}
        existingDepots={depots}
      />

      <AddLocationMappingModal
        open={addLocationModalOpen}
        setOpen={setAddLocationModalOpen}
      />

      <BulkImportModal
        open={bulkImportModalOpen}
        onClose={() => setBulkImportModalOpen(false)}
        entityType="location"
      />
    </div>
  );
}
