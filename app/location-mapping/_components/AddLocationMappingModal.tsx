"use client";
import { useState } from "react";
import { Modal, Form, Input, Select, Button, message } from "antd";
import { useLocationMappingStore } from "@/store/location-mapping.store";
import {
  LOCATION_TYPE_OPTIONS,
  LocationTypeEnum,
} from "@/apis/location-mapping.api";
import AddressAutocomplete, {
  AddressData,
} from "@/components/AddressAutocomplete";
import LocationTypeSelect from "./LocationTypeSelect";

interface AddLocationMappingModalProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

interface AddLocationMappingFormValues {
  name: string;
  type?: LocationTypeEnum;
  address?: string;
  aliases?: string;
}

export default function AddLocationMappingModal({
  open,
  setOpen,
}: AddLocationMappingModalProps) {
  const [form] = Form.useForm();
  const { createLocationMapping, isSaving } = useLocationMappingStore();
  const [selectedAddressData, setSelectedAddressData] =
    useState<AddressData | null>(null);

  const handleClose = () => {
    form.resetFields();
    setSelectedAddressData(null);
    setOpen(false);
  };

  const handleFinish = async (values: AddLocationMappingFormValues) => {
    const addressInput = values.address?.trim() || values.name.trim();
    let lat = selectedAddressData?.location?.lat;
    let lng = selectedAddressData?.location?.lng;
    let city = selectedAddressData?.city;
    let country = selectedAddressData?.country;

    // Fallback: If address was typed manually without selecting from dropdown predictions, geocode it
    if (
      (lat === undefined || lng === undefined) &&
      addressInput &&
      typeof window !== "undefined" &&
      window.google?.maps?.Geocoder
    ) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const response = await new Promise<google.maps.GeocoderResult[] | null>(
          (resolve) => {
            geocoder.geocode({ address: addressInput }, (results, status) => {
              if (
                status === google.maps.GeocoderStatus.OK &&
                results
              ) {
                resolve(results);
              } else {
                resolve(null);
              }
            });
          },
        );

        if (response && response[0]?.geometry?.location) {
          lat = response[0].geometry.location.lat();
          lng = response[0].geometry.location.lng();
          if (response[0].address_components) {
            for (const comp of response[0].address_components) {
              if (comp.types.includes("locality") && !city)
                city = comp.long_name;
              if (comp.types.includes("country") && !country)
                country = comp.long_name;
            }
          }
        }
      } catch (err) {
        console.error("Geocoding error:", err);
      }
    }

    const success = await createLocationMapping({
      name: values.name.trim(),
      type: values.type || "metro_station",
      location_type: values.type || "metro_station",
      address: addressInput,
      city: city || undefined,
      country: country || undefined,
      latitude: lat,
      longitude: lng,
      aliases: values.aliases
        ? values.aliases
            .split(",")
            .map((a: string) => a.trim())
            .filter(Boolean)
        : undefined,
      is_active: true,
    });

    if (success) {
      message.success("Location reference mapping created!");
      handleClose();
    } else {
      message.error("Failed to create location mapping");
    }
  };

  return (
    <Modal
      title="Add Location Reference Mapping"
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      className="rounded-none"
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{ type: "metro_station" }}
        className="mt-4 space-y-3"
      >
        <Form.Item
          label="Station / Location Name"
          name="name"
          rules={[
            { required: true, message: "Please enter station/location name" },
          ]}
        >
          <Input
            placeholder="e.g. Montmorency Metro"
            className="rounded-none text-xs"
          />
        </Form.Item>

        <Form.Item label="Location Type" name="type">
          <LocationTypeSelect
            placeholder="Select location type"
            className="rounded-none text-xs"
          />
        </Form.Item>

        <Form.Item label="Street Address / Location" name="address">
          <AddressAutocomplete
            value={form.getFieldValue("address")}
            placeholder="e.g. 5300 Henri-Bourassa Blvd W, Montreal"
            onChange={(val) => {
              form.setFieldsValue({ address: val });
              if (
                selectedAddressData &&
                selectedAddressData.address_formatted !== val
              ) {
                setSelectedAddressData(null);
              }
            }}
            onSelect={(addressData: AddressData) => {
              form.setFieldsValue({
                address: addressData.address_formatted,
              });
              setSelectedAddressData(addressData);
            }}
          />
        </Form.Item>

        <Form.Item
          label="Aliases / Station Codes (comma separated)"
          name="aliases"
        >
          <Input
            placeholder="e.g. MTR-01, Montmorency"
            className="rounded-none text-xs font-mono"
          />
        </Form.Item>

        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button onClick={handleClose} className="rounded-none">
            Cancel
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            loading={isSaving}
            className="rounded-none bg-[#003220] hover:bg-[#003220]/90"
          >
            Save Location Mapping
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
