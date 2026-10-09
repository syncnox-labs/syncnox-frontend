import React, { useState, useEffect, useMemo } from "react";
import { Select, Button, message, Empty, Divider, Spin } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useLocationMappingStore } from "@/store/location-mapping.store";

interface LocationTypeSelectProps {
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  className?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

export const LocationTypeSelect: React.FC<LocationTypeSelectProps> = ({
  value,
  onChange,
  placeholder = "Select location type",
  className = "rounded-none text-xs",
  allowClear = false,
  disabled = false,
}) => {
  const {
    locationTypes,
    hasFetchedTypes,
    isLoadingTypes,
    fetchLocationTypes,
    createCustomLocationTypeAction,
  } = useLocationMappingStore();

  const [searchValue, setSearchValue] = useState<string>("");
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Fetch tenant location types on mount if not already fetched
  useEffect(() => {
    if (!hasFetchedTypes) {
      fetchLocationTypes();
    }
  }, [hasFetchedTypes, fetchLocationTypes]);

  // Options mapped for Ant Design Select
  const options = useMemo(() => {
    return locationTypes.map((t) => ({
      value: t.value,
      label: t.label,
      isCustom: t.is_custom,
    }));
  }, [locationTypes]);

  // Check if typed search value matches any existing option exactly
  const trimmedSearch = searchValue.trim();
  const exactMatchExists = useMemo(() => {
    if (!trimmedSearch) return true;
    return options.some(
      (opt) =>
        opt.label.toLowerCase() === trimmedSearch.toLowerCase() ||
        opt.value.toLowerCase() === trimmedSearch.toLowerCase()
    );
  }, [options, trimmedSearch]);

  // Filtered options based on search text
  const filteredOptions = useMemo(() => {
    if (!trimmedSearch) return options;
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(trimmedSearch.toLowerCase())
    );
  }, [options, trimmedSearch]);

  const handleCreate = async (typeName: string) => {
    if (!typeName) return;
    setIsCreating(true);
    try {
      const created = await createCustomLocationTypeAction(typeName);
      if (created) {
        message.success(`Location type "${created.label}" created for this organization`);
        onChange?.(created.value);
        setSearchValue("");
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || "Failed to create location type");
    } finally {
      setIsCreating(false);
    }
  };

  // Default to metro_station if no value is present
  const currentValue = value || "metro_station";

  return (
    <Select
      showSearch
      value={currentValue}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      allowClear={allowClear}
      searchValue={searchValue}
      onSearch={(text) => setSearchValue(text)}
      filterOption={false} // We filter manually via filteredOptions
      options={filteredOptions}
      dropdownRender={(menu) => (
        <div>
          {menu}
          {trimmedSearch && !exactMatchExists && (
            <div>
              <Divider className="my-1 border-slate-200" />
              <div className="p-1.5 bg-slate-50">
                <Button
                  type="text"
                  block
                  icon={<PlusOutlined className="text-[#003220]" />}
                  loading={isCreating}
                  onMouseDown={(e) => {
                    // Prevent select blur before click registers
                    e.preventDefault();
                  }}
                  onClick={() => handleCreate(trimmedSearch)}
                  className="text-left flex items-center justify-start text-xs font-semibold text-[#003220] hover:bg-emerald-100/60 rounded-none h-8 transition-colors"
                >
                  Create &ldquo;{trimmedSearch}&rdquo; for this organization
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      notFoundContent={
        isLoadingTypes ? (
          <div className="p-4 text-center">
            <Spin size="small" />
          </div>
        ) : trimmedSearch ? (
          <div className="p-3 text-center">
            <div className="text-xs text-slate-500 mb-2">
              No matching location types
            </div>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              loading={isCreating}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleCreate(trimmedSearch)}
              className="bg-[#003220] hover:bg-[#004d32] border-none text-xs rounded-none"
            >
              Create &ldquo;{trimmedSearch}&rdquo;
            </Button>
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No location types" />
        )
      }
    />
  );
};

export default LocationTypeSelect;
