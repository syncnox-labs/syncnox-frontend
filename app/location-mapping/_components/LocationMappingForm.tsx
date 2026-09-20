"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Form, Input, Select, message, Typography, Flex } from "antd";
import type { FormInstance } from "antd";
import {
  LocationMapping,
  LocationTypeEnum,
  LOCATION_TYPE_OPTIONS
} from "@/apis/location-mapping.api";

export interface LocationMappingFormValues {
  name: string;
  type?: LocationTypeEnum;
  address?: string;
  city?: string;
  country?: string;
  aliases?: string;
}
import { useLocationMappingStore } from "@/store/location-mapping.store";
import GoogleMaps from "@/components/GoogleMaps";
import AddressAutocomplete, { AddressData } from "@/components/AddressAutocomplete";
import { isTextInput } from "@/utils/form.utils";

const { Text } = Typography;

interface LocationMappingFormProps {
  initialData?: LocationMapping | null;
  isInline?: boolean;
  form?: FormInstance;
  existingLocations?: LocationMapping[];
}

const getCoords = (data: any) => {
  if (!data) return null;
  const lat = data.latitude ?? data.lat ?? data.location?.lat;
  const lng = data.longitude ?? data.lng ?? data.location?.lng;
  if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
    return { lat, lng };
  }
  return null;
};

const LocationMappingForm = ({
  initialData = null,
  form: externalForm,
  existingLocations = [],
}: LocationMappingFormProps) => {
  const [internalForm] = Form.useForm();
  const form = externalForm || internalForm;
  const { updateLocationMapping } = useLocationMappingStore();

  const [mapLocation, setMapLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Auto-save refs
  const isPrefillingRef = useRef<boolean>(true);
  const prevInitialDataIdRef = useRef<number | null>(null);

  const triggerAutoSave = () => {
    if (!initialData?.id || isPrefillingRef.current) return;
    form
      .validateFields()
      .then(() => {
        form.submit();
      })
      .catch(() => {});
  };

  const handleValuesChange = () => {
    if (!isTextInput(document.activeElement)) {
      triggerAutoSave();
    }
  };

  const handleBlurCapture = (e: React.FocusEvent) => {
    if (isTextInput(e.target as Element)) {
      triggerAutoSave();
    }
  };

  useEffect(() => {
    if (initialData?.id && initialData.id === prevInitialDataIdRef.current) {
      return;
    }

    if (initialData) {
      prevInitialDataIdRef.current = initialData.id;
      isPrefillingRef.current = true;
      const initialType =
        (initialData.type as LocationTypeEnum) ||
        (initialData.location_type as LocationTypeEnum) ||
        undefined;

      form.setFieldsValue({
        name: initialData.name,
        type: initialType,
        address: initialData.address || undefined,
        city: initialData.city || undefined,
        country: initialData.country || undefined,
        aliases: initialData.aliases?.join(", ") || undefined,
      });

      const coords = getCoords(initialData);
      if (coords) {
        setMapLocation(coords);
      } else if (initialData.address || initialData.city || initialData.name) {
        const fullAddress = [initialData.address, initialData.city, initialData.country]
          .filter(Boolean)
          .join(", ");
        if (typeof window !== "undefined" && (window as any).google?.maps?.Geocoder) {
          const geocoder = new (window as any).google.maps.Geocoder();
          geocoder.geocode({ address: fullAddress || initialData.name }, (results: any, status: any) => {
            if (status === "OK" && results && results[0]?.geometry?.location) {
              const loc = {
                lat: results[0].geometry.location.lat(),
                lng: results[0].geometry.location.lng(),
              };
              setMapLocation(loc);
            } else {
              setMapLocation({ lat: 45.5017, lng: -73.5673 });
            }
          });
        } else {
          setMapLocation({ lat: 45.5017, lng: -73.5673 });
        }
      } else {
        setMapLocation({ lat: 45.5017, lng: -73.5673 });
      }

      setTimeout(() => {
        isPrefillingRef.current = false;
      }, 200);
    }
  }, [initialData, form]);

  const onFinish = async (values: LocationMappingFormValues) => {
    if (!initialData?.id) return;
    const payload = {
      name: values.name.trim(),
      type: values.type,
      location_type: values.type,
      address: values.address?.trim() || undefined,
      city: values.city?.trim() || undefined,
      country: values.country?.trim() || undefined,
      latitude: mapLocation?.lat,
      longitude: mapLocation?.lng,
      aliases: values.aliases
        ? values.aliases
            .split(",")
            .map((a: string) => a.trim())
            .filter(Boolean)
        : undefined,
    };
    const success = await updateLocationMapping(initialData.id, payload);
    if (success) {
      message.success("Location mapping updated");
    } else {
      message.error("Failed to update location mapping");
    }
    return success;
  };

  const existingMarkers = useMemo(() => {
    return existingLocations
      .map((m) => {
        const coords = getCoords(m);
        if (!coords || m.id === initialData?.id) return null;
        return {
          id: m.id,
          position: coords,
          title: m.name,
          description: m.address || m.name,
          isDepot: true,
          color: "#003220",
          draggable: false,
        };
      })
      .filter(Boolean) as any[];
  }, [existingLocations, initialData?.id]);

  const currentMarker = mapLocation
    ? [
        {
          id: initialData?.id || "location-current",
          position: mapLocation,
          title: initialData?.name || "Location",
          description: initialData?.address || initialData?.name || "Location",
          isDepot: true,
          color: "#003220",
          draggable: true,
        },
      ]
    : [];

  const allMarkers = [...existingMarkers, ...currentMarker];

  const defaultCenter = { lat: 45.5017, lng: -73.5673 };
  const mapCenter = mapLocation || (existingMarkers.length > 0 ? existingMarkers[0].position : defaultCenter);

  return (
    <Flex vertical gap={4} className="font-sans h-full">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        onValuesChange={handleValuesChange}
        onBlurCapture={handleBlurCapture}
        className="flex flex-col h-full"
        autoComplete="off"
      >
        <div className="grid grid-cols-2 gap-3 mb-2 shrink-0">
          <Form.Item
            label="Station / Location Name"
            name="name"
            className="mb-0"
            rules={[{ required: true, message: "Please enter station/location name" }]}
          >
            <Input
              placeholder="e.g. Montmorency Metro"
              className="rounded-none text-xs"
            />
          </Form.Item>

          <Form.Item label="Street Address / Location" name="address" className="mb-0">
            <AddressAutocomplete
              value={form.getFieldValue("address")}
              placeholder="e.g. 5300 Henri-Bourassa Blvd W, Montreal"
              onChange={(val) => {
                form.setFieldsValue({ address: val });
                triggerAutoSave();
              }}
              onSelect={(addressData: AddressData) => {
                form.setFieldsValue({
                  address: addressData.address_formatted,
                  city: addressData.city || form.getFieldValue("city"),
                  country: addressData.country || form.getFieldValue("country"),
                });
                if (addressData.location) {
                  setMapLocation(addressData.location);
                }
                triggerAutoSave();
              }}
            />
          </Form.Item>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-2 shrink-0">
          <Form.Item label="Location Type" name="type" className="mb-0">
            <Select
              placeholder="Select location type (optional)"
              allowClear
              options={LOCATION_TYPE_OPTIONS}
              className="rounded-none text-xs"
            />
          </Form.Item>

          <Form.Item label="City" name="city" className="mb-0">
            <Input
              placeholder="e.g. Montreal"
              className="rounded-none text-xs"
            />
          </Form.Item>

          <Form.Item label="Country" name="country" className="mb-0">
            <Input
              placeholder="e.g. Canada"
              className="rounded-none text-xs"
            />
          </Form.Item>

          <Form.Item label="Aliases / Station Codes" name="aliases" className="mb-0">
            <Input
              placeholder="e.g. MTR-01, Montmorency"
              className="rounded-none text-xs font-mono"
            />
          </Form.Item>
        </div>

        {/* Embedded Interactive Map identical to Depots view */}
        <div className="flex-1 min-h-[280px] border border-gray-200 overflow-hidden relative rounded-none my-2">
          <GoogleMaps
            markers={allMarkers}
            center={mapCenter}
            zoom={mapLocation ? 15 : 11}
            onMarkerDragEnd={(_markerId, newPosition) => {
              if (newPosition) {
                setMapLocation(newPosition);
                triggerAutoSave();
              }
            }}
          />
        </div>
      </Form>
    </Flex>
  );
};

export default LocationMappingForm;
