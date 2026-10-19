"use client";

import { useEffect, useMemo, useRef } from "react";
import dayjs from "dayjs";
import { Alert, Button, Checkbox, Col, DatePicker, Empty, Flex, Form, Input, InputNumber, Row, Select, Spin, TimePicker, message } from "antd";
import type { Rule } from "antd/es/form";
import { PlusCircleOutlined } from "@ant-design/icons";
import { Job } from "@/types/job.type";
import type { CustomFieldDefinition } from "@/apis/custom-fields.api";
import AddressAutocomplete, { AddressData } from "@/components/AddressAutocomplete";
import { useFieldConfig } from "@/hooks/useFieldConfig";
import { useJobsStore } from "@/store/jobs.store";
import { useTeamStore } from "@/store/team.store";
import { useIndexStore } from "@/store/index.store";
import { useDepotStore } from "@/store/depots.store";
import { useLocationMappingStore } from "@/store/location-mapping.store";
import { ADDRESS_LOCATION_KEYS, buildJobFormPayload, getJobFieldControl, getJobFormFields, getJobInitialValues, parseCoordinates } from "./jobForm.schema";

interface JobFormProps {
  initialData?: Job | null;
  onSubmit?: (job?: Job) => void;
  defaultTemplate?: string;
  defaultDate?: string | dayjs.Dayjs;
  defaultJobType?: string;
}

const GeoInput = ({ value, onChange }: { value?: unknown; onChange?: (value: string) => void }) => {
  const point = typeof value === "object" ? parseCoordinates(value) : undefined;
  return <Input value={point ? `${point.lat}, ${point.lng}` : String(value ?? "")}
    placeholder="Latitude, longitude" onChange={event => onChange?.(event.target.value)} />;
};

const JobForm = ({ initialData = null, onSubmit, defaultTemplate, defaultDate, defaultJobType }: JobFormProps) => {
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const { isLoading, createJobAction, updateJobAction } = useJobsStore();
  const { teams } = useTeamStore();
  const { depots } = useDepotStore();
  const { locationMappings } = useLocationMappingStore();
  const activeJobTemplate = useIndexStore(state => state.activeJobTemplate);
  const activeTemplate = initialData?.template_type || defaultTemplate || activeJobTemplate || "pickup_delivery_job";
  const { customFields, loading, error, reloadConfigs } = useFieldConfig("job");
  const fields = useMemo(() => getJobFormFields(customFields), [customFields]);
  const addressLocations = useRef<Record<string, unknown>>({});
  const date = dayjs.isDayjs(defaultDate) ? defaultDate.format("YYYY-MM-DD") : defaultDate;

  const predefinedLocations = useMemo(() => [
    ...depots.filter(depot => typeof depot.location?.lat === "number" && typeof depot.location?.lng === "number").map(depot => ({
      label: `Depot: ${depot.name}`,
      addressData: { address_formatted: depot.address?.formatted_address || "", location: { lat: depot.location!.lat!, lng: depot.location!.lng! } },
    })),
    ...locationMappings.filter(location => typeof location.latitude === "number" && typeof location.longitude === "number").map(location => ({
      label: `Location: ${location.name || location.address || ""}`,
      addressData: { address_formatted: location.address || "", location: { lat: location.latitude!, lng: location.longitude! } },
    })),
  ], [depots, locationMappings]);

  useEffect(() => {
    if (loading) return;
    form.resetFields();
    form.setFieldsValue(getJobInitialValues(fields, initialData, { date, jobType: defaultJobType }));
    const detail = initialData?.worker_shuttle_detail || initialData?.pickup_delivery_detail;
    addressLocations.current = Object.fromEntries(Object.entries(ADDRESS_LOCATION_KEYS).map(([key, locationKey]) => [
      key, (initialData as unknown as Record<string, unknown> | null)?.[locationKey] ?? detail?.[locationKey] ?? initialData?.custom_fields?.[locationKey],
    ]));
  }, [form, fields, initialData, date, defaultJobType, loading]);

  const onFinish = async (values: Record<string, unknown>) => {
    if (loading || error || !fields.length) return;
    const payload = buildJobFormPayload(fields, values, activeTemplate, addressLocations.current);
    try {
      const job = initialData?.id
        ? await updateJobAction({ ...payload, id: initialData.id } as Job)
        : await createJobAction(payload);
      messageApi.success(initialData ? "Job updated successfully" : "Job created successfully");
      onSubmit?.(Array.isArray(job) ? job[0] : job);
    } catch (failure: unknown) {
      const detail = (failure as { detail?: unknown; response?: { data?: { detail?: unknown } } })?.response?.data?.detail
        ?? (failure as { detail?: unknown })?.detail;
      messageApi.error(typeof detail === "string" ? detail : "Unable to save job. Check the configured fields and try again.");
    }
  };

  const addressSelected = (key: string, data: AddressData) => {
    form.setFieldValue(key, data.address_formatted);
    addressLocations.current[key] = data.location;
    const locationKey = ADDRESS_LOCATION_KEYS[key];
    if (fields.some(field => field.field_key === locationKey)) form.setFieldValue(locationKey, data.location);
  };

  const renderControl = (field: CustomFieldDefinition) => {
    const key = field.field_key;
    const placeholder = `Enter ${field.label}`;
    switch (getJobFieldControl(field)) {
      case "select":
        return <Select allowClear placeholder={`Select ${field.label}`} options={
          key === "assigned_to" && field.options == null
            ? teams.map(team => ({ value: team.id, label: team.name }))
            : (field.options || []).map(value => ({ value, label: String(value) }))
        } />;
      case "boolean":
        return <Checkbox>{field.description || field.label}</Checkbox>;
      case "number":
        return <InputNumber className="w-full" placeholder={placeholder} />;
      case "date":
        return <DatePicker format="DD-MM-YYYY" className="w-full" />;
      case "time":
        return <TimePicker format="HH:mm" needConfirm={false} className="w-full" />;
      case "time_range":
        return <TimePicker.RangePicker format="HH:mm" needConfirm={false} className="w-full" />;
      case "geo":
        return <GeoInput />;
      case "address":
        return <AddressAutocomplete placeholder={`Search ${field.label}`} predefinedOptions={predefinedLocations}
          onChange={() => { addressLocations.current[key] = null; }}
          onSelect={data => addressSelected(key, data)} />;
      default:
        return ["notes", "additional_notes", "pod_notes", "customer_preferences"].includes(key)
          ? <Input.TextArea rows={3} placeholder={placeholder} />
          : <Input placeholder={placeholder} />;
    }
  };

  return <Flex vertical style={{ height: "100%", overflow: "hidden" }}>
    {contextHolder}
    <div className="custom-scrollbar" style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "0 8px" }}>
      {loading ? <div className="flex justify-center py-12"><Spin /></div>
        : error ? <Alert type="error" showIcon title={error} action={<Button onClick={() => void reloadConfigs()}>Retry</Button>} />
        : fields.length === 0 ? <Empty description="No job fields are enabled for dispatch. Configure them in Custom Fields settings." />
        : <Form form={form} layout="vertical" onFinish={onFinish} preserve={false}>
          <Row gutter={16}>
            {fields.map(field => {
              const control = getJobFieldControl(field);
              const rules: Rule[] = [{ required: field.is_required, message: `${field.label} is required`,
                ...(control === "boolean" ? { type: "boolean" as const } : {}) }];
              if (control === "geo") rules.push({ validator: (_, value) =>
                value === undefined || value === null || value === "" || parseCoordinates(value)
                  ? Promise.resolve() : Promise.reject(new Error("Enter a valid latitude, longitude")) });
              return <Col key={field.id} xs={24} sm={control === "address" || control === "geo" ? 24 : 12}>
                <Form.Item name={field.field_key} label={field.label} rules={rules}
                  required={field.is_required} tooltip={field.description || undefined}
                  valuePropName={control === "boolean" ? "checked" : "value"}>
                  {renderControl(field)}
                </Form.Item>
              </Col>;
            })}
          </Row>
        </Form>}
    </div>
    <Button type="primary" block icon={<PlusCircleOutlined />} loading={isLoading}
      disabled={loading || Boolean(error) || fields.length === 0} style={{ marginTop: 12 }} onClick={() => form.submit()}>
      {initialData ? "Update" : "Add"}
    </Button>
  </Flex>;
};

export default JobForm;
