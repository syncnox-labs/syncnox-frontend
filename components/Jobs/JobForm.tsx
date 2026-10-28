"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { getJobPickupType } from "@/utils/jobPickupType.utils";
import { ADDRESS_LOCATION_KEYS, SHUTTLE_ADDRESSES, buildJobFormPayload, buildJobFormPatch, getJobDisplayFields, getJobFieldControl, getJobInitialValues, getShuttleAddressValues, parseCoordinates } from "./jobForm.schema";

interface JobFormProps {
  initialData?: Job | null;
  onSubmit?: (job?: Job, jobs?: Job[]) => void | Promise<void>;
  createJobs?: (payload: Record<string, unknown>) => Promise<Job | Job[]>;
  onSubmittingChange?: (saving: boolean) => void;
  defaultTemplate?: string;
  defaultDate?: string | dayjs.Dayjs;
  defaultJobType?: string;
}

const GeoInput = ({ value, onChange }: { value?: unknown; onChange?: (value: string) => void }) => {
  const point = typeof value === "object" ? parseCoordinates(value) : undefined;
  return <Input value={point ? `${point.lat}, ${point.lng}` : String(value ?? "")}
    placeholder="Latitude, longitude" onChange={event => onChange?.(event.target.value)} />;
};

const JobForm = ({ initialData = null, onSubmit, defaultTemplate, defaultDate, defaultJobType, createJobs, onSubmittingChange }: JobFormProps) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [messageApi, contextHolder] = message.useMessage();
  const { isLoading, createJobAction, updateJobAction } = useJobsStore();
  const { teams } = useTeamStore();
  const { depots } = useDepotStore();
  const { locationMappings } = useLocationMappingStore();
  const activeJobTemplate = useIndexStore(state => state.activeJobTemplate);
  const activeTemplate = initialData?.template_type || defaultTemplate || activeJobTemplate || "pickup_delivery_job";
  const { customFields, loading, error, reloadConfigs } = useFieldConfig("job");
  const fields = useMemo(() => getJobDisplayFields(customFields, activeTemplate, initialData?.job_type || defaultJobType), [customFields, activeTemplate, initialData?.job_type, defaultJobType]);
  const addressLocations = useRef<Record<string, unknown>>({});
  const initialPayload = useRef<Record<string, unknown>>({});
  const date = dayjs.isDayjs(defaultDate) ? defaultDate.format("YYYY-MM-DD") : defaultDate;
  const initialValues = useMemo(
    () => getJobInitialValues(fields, initialData, { date, jobType: defaultJobType }),
    [fields, initialData, date, defaultJobType],
  );
  const watchedPickupType = Form.useWatch("pickup_type", form);
  const bookingType = getJobPickupType({ pickup_type: watchedPickupType || initialValues.pickup_type || initialValues.job_type || defaultJobType || getJobPickupType(initialData) || "one_way" } as Job);
  const visibleFields = fields.filter(field => activeTemplate !== "worker_shuttle"
    || !SHUTTLE_ADDRESSES.includes(field.field_key)
    || bookingType === "round_trip" || (bookingType === "return_only" ? field.field_key.startsWith("return_") : field.field_key.startsWith("go_")));

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
    // Use Form's initial values so field remounts (including Strict Mode)
    // restore the job data when preserve=false clears unregistered fields.
    form.resetFields();
    const detail = initialData?.worker_shuttle_detail || initialData?.pickup_delivery_detail;
    const shuttleAddresses = getShuttleAddressValues(initialData);
    addressLocations.current = Object.fromEntries(Object.entries(ADDRESS_LOCATION_KEYS).map(([key, locationKey]) => [
      key, shuttleAddresses[locationKey] ?? (initialData as unknown as Record<string, unknown> | null)?.[locationKey] ?? detail?.[locationKey] ?? initialData?.custom_fields?.[locationKey],
    ]));
    initialPayload.current = buildJobFormPayload(fields, initialValues, activeTemplate, addressLocations.current);
  }, [form, initialValues, initialData, loading, fields, activeTemplate]);

  const onFinish = async (values: Record<string, unknown>) => {
    if (loading || error || !fields.length || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    onSubmittingChange?.(true);
    try {
      const payload = buildJobFormPayload(fields, values, activeTemplate, addressLocations.current);
      const changes = initialData?.id ? buildJobFormPatch(initialPayload.current, payload) : payload;
      if (initialData?.id && !Object.keys(changes).length) {
        await onSubmit?.(initialData);
        return;
      }
      const job = initialData?.id
        ? await updateJobAction({ ...changes, id: initialData.id } as Job)
        : await (createJobs ? createJobs(payload) : createJobAction(payload));
      const saved = (Array.isArray(job) ? job : [job]) as Job[];
      await onSubmit?.(saved[0], saved);
      if (!createJobs) messageApi.success(initialData ? "Job updated successfully" : `${saved.length} job(s) created successfully`);
    } catch (failure: unknown) {
      const detail = (failure as { detail?: unknown; response?: { data?: { detail?: unknown } } })?.response?.data?.detail
        ?? (failure as { detail?: unknown })?.detail;
      const validation = Array.isArray(detail) ? detail.map(item => item.msg).filter(Boolean).join("; ") : undefined;
      messageApi.error(typeof detail === "string" ? detail : validation || (failure instanceof Error ? failure.message : "Unable to save job. Check the configured fields and try again."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
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
            : (field.options || []).map(value => ({ value, label: key === "pickup_type"
              ? String(value).replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase())
              : String(value) }))
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
        : <Form disabled={submitting} form={form} initialValues={initialValues} layout="vertical" onFinish={onFinish} preserve={false}>
          <Row gutter={16}>
            {visibleFields.map(configuredField => {
              const physicalDirection = bookingType === "round_trip" ? initialData?.job_type || defaultJobType : bookingType;
              const field = activeTemplate === "worker_shuttle" && ["pick_up_address", "drop_off_address"].includes(configuredField.field_key)
                ? { ...configuredField, label: `${physicalDirection === "return_only" ? "Return" : "Go"} ${configuredField.field_key === "pick_up_address" ? "pickup" : "dropoff"} address` }
                : configuredField;
              const control = getJobFieldControl(field);
              const required = field.is_required || (activeTemplate === "worker_shuttle" && SHUTTLE_ADDRESSES.includes(field.field_key));
              const rules: Rule[] = [{ required, message: `${field.label} is required`,
                ...(control === "boolean" ? { type: "boolean" as const } : {}) }];
              if (control === "geo") rules.push({ validator: (_, value) =>
                value === undefined || value === null || value === "" || parseCoordinates(value)
                  ? Promise.resolve() : Promise.reject(new Error("Enter a valid latitude, longitude")) });
              return <Col key={field.id} xs={24} sm={control === "address" || control === "geo" ? 24 : 12}>
                <Form.Item name={field.field_key} label={field.label} rules={rules}
                  required={required} tooltip={field.description || undefined}
                  preserve={activeTemplate === "worker_shuttle" && SHUTTLE_ADDRESSES.includes(field.field_key)}
                  valuePropName={control === "boolean" ? "checked" : "value"}>
                  {renderControl(field)}
                </Form.Item>
              </Col>;
            })}
          </Row>
        </Form>}
    </div>
    <Button type="primary" block icon={<PlusCircleOutlined />} loading={isLoading || submitting}
      disabled={loading || Boolean(error) || fields.length === 0} style={{ marginTop: 12 }} onClick={() => form.submit()}>
      {initialData ? "Update" : "Add"}
    </Button>
  </Flex>;
};

export default JobForm;
