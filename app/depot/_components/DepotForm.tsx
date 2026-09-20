"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { ArrowRight } from "lucide-react";
import GoogleMaps from "@/components/GoogleMaps";
import { Button, message, Input } from "antd";
import AddressAutocomplete, {
  AddressData,
} from "@/components/AddressAutocomplete";
import { DepotPayload } from "@/apis/depots.api";
import { Depot } from "@/types/depots.type";
import { isTextInput } from "@/utils/form.utils";

import { CustomFieldDefinition, getCustomFields } from "@/apis/custom-fields.api";
import { DynamicCustomFieldsForm } from "@/components/DynamicCustomFieldsForm";

interface DepotFormProps {
  initialValues?: Depot;
  onSubmit: (values: DepotPayload) => Promise<boolean>;
  isLoading: boolean;
  onCancel: () => void;
  submitLabel?: string;
  isOnboarding?: boolean;
  existingDepots?: Depot[];
}

const DepotForm = ({
  initialValues,
  onSubmit,
  isLoading,
  onCancel,
  submitLabel,
  isOnboarding = false,
  existingDepots = [],
}: DepotFormProps) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});

  useEffect(() => {
    getCustomFields("depot")
      .then((defs) => setCustomFieldDefs(defs))
      .catch((err) => console.error("Failed to load depot custom fields", err));
  }, []);

  useEffect(() => {
    if (initialValues?.custom_fields) {
      setCustomFieldValues(initialValues.custom_fields);
    }
  }, [initialValues]);

  const isPrefillingRef = useRef<boolean>(true);
  const prevInitialValuesIdRef = useRef<any>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep ref of latest state to prevent stale closure in auto-save
  const latestValuesRef = useRef({ name, address, location, custom_fields: customFieldValues });
  useEffect(() => {
    latestValuesRef.current = { name, address, location, custom_fields: customFieldValues };
  }, [name, address, location, customFieldValues]);

  const handleSave = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    const { name: currentName, address: currentAddress, location: currentLocation } =
      latestValuesRef.current;

    if (!currentName.trim()) {
      messageApi.error("Please enter a depot name");
      return;
    }
    if (!currentLocation) {
      messageApi.error("Please select a location");
      return;
    }

    const success = await onSubmit({
      name: currentName.trim(),
      address: {
        formatted_address: currentAddress,
      },
      location: currentLocation,
      custom_fields: latestValuesRef.current.custom_fields,
    });

    if (success) {
      messageApi.success(
        initialValues
          ? "Depot saved successfully"
          : "Depot created successfully",
      );
      if (!initialValues) {
        onCancel(); // Close form on new creation success
      }
    } else {
      messageApi.error("Failed to save depot");
    }
  };

  const triggerAutoSave = () => {
    if (!initialValues?.id || isPrefillingRef.current) return;
    const { name: currentName, location: currentLocation } = latestValuesRef.current;
    if (currentName.trim() && currentLocation) {
      handleSave();
    }
  };

  const handleBlurCapture = (e: React.FocusEvent) => {
    if (isTextInput(e.target as Element)) {
      triggerAutoSave();
    }
  };

  useEffect(() => {
    if (initialValues?.id && initialValues.id === prevInitialValuesIdRef.current) {
      return;
    }

    if (initialValues) {
      prevInitialValuesIdRef.current = initialValues.id;
      isPrefillingRef.current = true;
      setName(initialValues.name || "");
      setAddress(initialValues.address?.formatted_address || "");
      if (initialValues.location) {
        setLocation({
          lat: initialValues.location.lat,
          lng: initialValues.location.lng,
        });
      }
      setTimeout(() => {
        isPrefillingRef.current = false;
      }, 200);
    } else {
      // Reset form
      setName("");
      setAddress("");
      setLocation(null);
    }
  }, [initialValues]);

  const hasChanges = useMemo(() => {
    if (!initialValues) return !!name && !!location; // Enable if all fields filled for new

    const originalName = initialValues.name || "";
    const originalAddress = initialValues.address?.formatted_address || "";
    const originalLat = initialValues.location?.lat;
    const originalLng = initialValues.location?.lng;

    return (
      name !== originalName ||
      address !== originalAddress ||
      location?.lat !== originalLat ||
      location?.lng !== originalLng
    );
  }, [initialValues, name, address, location]);

  // ─── Map markers ────────────────────────────────────────────────────────────
  // All existing depots as non-draggable read-only markers
  const existingMarkers = existingDepots
    .filter((d) => d.location && d.id !== initialValues?.id) // exclude the one being edited
    .map((d) => ({
      id: d.id,
      position: { lat: d.location!.lat, lng: d.location!.lng },
      title: d.name,
      description: d.address?.formatted_address || d.name,
      isDepot: true,
      draggable: false,
    }));

  // Current depot being created / edited (draggable)
  const currentMarkerId = initialValues?.id || "depot-current";
  const currentMarker =
    location || initialValues?.location
      ? [
          {
            id: currentMarkerId,
            position: location || initialValues?.location || { lat: 0, lng: 0 },
            title: name || initialValues?.name || "Depot",
            isDepot: true,
            description:
              address || initialValues?.address?.formatted_address || "Depot",
            draggable: true,
          },
        ]
      : [];

  const allMarkers = [...existingMarkers, ...currentMarker];

  // ─── Map center ─────────────────────────────────────────────────────────────
  // When editing: focus on the current depot.
  // When creating: focus on the newly selected location, then fall back to the
  // last existing depot, then fall back to the default SF coords.
  const defaultCenter = { lat: 37.7749, lng: -122.4194 };

  const lastExistingDepotCenter =
    existingDepots.length > 0 &&
    existingDepots[existingDepots.length - 1].location
      ? {
          lat: existingDepots[existingDepots.length - 1].location!.lat,
          lng: existingDepots[existingDepots.length - 1].location!.lng,
        }
      : null;

  const mapCenter =
    location ||
    initialValues?.location ||
    lastExistingDepotCenter ||
    defaultCenter;

  return (
    <div className="flex flex-col h-full" onBlurCapture={handleBlurCapture}>
      {contextHolder}
      <div className="flex gap-2 w-full mb-2">
        <div className="w-1/3">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="Enter depot name"
          />
        </div>
        <div className="w-2/3">
          <AddressAutocomplete
            value={address}
            placeholder="Search depot address..."
            onChange={() => {
              setLocation(null);
            }}
            onSelect={(addressData: AddressData) => {
              setAddress(addressData.address_formatted);
              setLocation(addressData.location);
              triggerAutoSave();
            }}
          />
        </div>
      </div>

      {customFieldDefs.length > 0 && (
        <div className="mb-3 px-1">
          <DynamicCustomFieldsForm
            customFields={customFieldDefs}
            values={customFieldValues}
            onChange={(updated) => {
              setCustomFieldValues(updated);
              if (!isTextInput(document.activeElement)) {
                triggerAutoSave();
              }
            }}
          />
        </div>
      )}

      <div className="flex-1 w-full overflow-hidden bg-gray-50">
        <GoogleMaps
          showMapTypeControl={true}
          showZoomControl={true}
          zoom={10}
          center={mapCenter}
          markers={allMarkers}
          selectedMarkerId={currentMarkerId}
          onMarkerDragEnd={(_, newPosition) => {
            setLocation(newPosition);
            triggerAutoSave();
          }}
        />
      </div>

      <div className={isOnboarding ? "pt-4 flex justify-end" : "pt-2"}>
        <Button
          type="primary"
          onClick={handleSave}
          loading={isLoading}
          disabled={!hasChanges}
          block={!isOnboarding}
          icon={isOnboarding ? <ArrowRight size={14} /> : undefined}
          iconPosition="end"
        >
          {submitLabel || (initialValues ? "Save" : "Create")}
        </Button>
      </div>
    </div>
  );
};

export default DepotForm;
