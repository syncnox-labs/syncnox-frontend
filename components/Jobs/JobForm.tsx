import { useEffect, useState } from "react";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);
import {
  Form,
  Input,
  Select,
  DatePicker,
  TimePicker,
  Button,
  message,
  Flex,
  Row,
  Col,
} from "antd";
import { PlusCircleOutlined } from "@ant-design/icons";
import { Job } from "@/types/job.type";
import { COUNTRY_CODES } from "@/constants/country";
import AddressAutocomplete, {
  AddressData,
} from "@/components/AddressAutocomplete";
import {
  JOB_TYPES,
  PAYMENT_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  RECURRENCE_OPTIONS,
} from "./jobForm.constants";
import {
  validateTimeWindowStart,
  validateTimeWindowEnd,
  phoneNumberPattern,
  validateJobDuration,
} from "./jobs.validation";
import { useJobsStore } from "@/store/jobs.store";
import { filterCountryOptions } from "@/utils/jobs.utils";
import { useTeamStore } from "@/store/team.store";
import { CustomFieldDefinition } from "@/apis/custom-fields.api";
import { DynamicCustomFieldsForm } from "@/components/DynamicCustomFieldsForm";
import { useFieldConfig } from "@/hooks/useFieldConfig";
import {
  Calendar,
  Clock,
  Navigation,
  Hash,
  User,
  Users,
  Timer,
  Fingerprint,
  MapPin,
  Building2,
  Phone,
  Mail,
  Flag,
  Repeat,
  Tag as TagIcon,
  FileText,
  ArrowRightLeft,
} from "lucide-react";

const FormLabel = ({
  icon: IconComponent,
  label,
}: {
  icon?: any;
  label: string;
}) => (
  <span className="inline-flex items-center gap-1.5 font-medium text-gray-700 text-xs">
    {IconComponent && <IconComponent size={14} className="text-gray-400 shrink-0" />}
    <span>{label}</span>
  </span>
);

const parseTimeToDayjs = (timeVal: any) => {
  if (!timeVal) return undefined;
  if (dayjs.isDayjs(timeVal)) return timeVal;
  if (typeof timeVal === "string") {
    const parsed = dayjs(timeVal, ["HH:mm:ss", "HH:mm", "HH:mm A"]);
    if (parsed.isValid()) return parsed;
    const fallback = dayjs(`2000-01-01 ${timeVal}`);
    if (fallback.isValid()) return fallback;
  }
  const d = dayjs(timeVal);
  return d.isValid() ? d : undefined;
};

const parseDateToDayjs = (dateVal: any) => {
  if (!dateVal) return undefined;
  if (dayjs.isDayjs(dateVal)) return dateVal;
  const d = dayjs(dateVal);
  return d.isValid() ? d : undefined;
};

interface JobFormProps {
  initialData?: Job | null;
  onSubmit?: (job?: Job) => void;
}

const JobForm = ({ initialData = null, onSubmit }: JobFormProps) => {
  const [messageApi, contextHolder] = message.useMessage();
  const { isLoading, createJobAction, updateJobAction } = useJobsStore();
  const { teams } = useTeamStore();
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});

  const [activeTemplate, setActiveTemplate] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("syncnox_active_job_template") || "pickup_delivery_job";
    }
    return "pickup_delivery_job";
  });

  useEffect(() => {
    const syncActiveTemplate = () => {
      const storedTemplate = localStorage.getItem("syncnox_active_job_template");
      if (storedTemplate) {
        setActiveTemplate(storedTemplate);
      }
    };

    syncActiveTemplate();

    if (typeof window !== "undefined") {
      window.addEventListener("syncnox_active_template_changed", syncActiveTemplate);
      return () => {
        window.removeEventListener("syncnox_active_template_changed", syncActiveTemplate);
      };
    }
  }, []);

  const { getFieldConfig, customFields: customFieldDefs } = useFieldConfig("job", activeTemplate);

  const [form] = Form.useForm();

  useEffect(() => {
    if (!initialData) {
      const currentJobType = form.getFieldValue("job_type");
      if (activeTemplate === "worker_shuttle") {
        if (!currentJobType || currentJobType === "pickup" || currentJobType === "round_trip") {
          form.setFieldsValue({ job_type: "one_way" });
        }
      } else {
        if (!currentJobType || currentJobType === "one_way" || currentJobType === "return_only" || currentJobType === "round_trip") {
          form.setFieldsValue({ job_type: "pickup" });
        }
      }
    }
  }, [activeTemplate, initialData, form]);

  const onFinish = async (values: any) => {
    // Transform the form values to match API requirements
    const transformedValues: any = {
      ...values,
      id: initialData?.id,
      template_type: activeTemplate,
    };

    // 1. Transform scheduled_date: dayjs object -> local date string (YYYY-MM-DD)
    if (values.scheduled_date) {
      transformedValues.scheduled_date = dayjs(values.scheduled_date).format(
        "YYYY-MM-DD",
      );
    }

    // 2. Transform time windows: dayjs object -> local time string (HH:mm)
    if (values.time_window_start) {
      transformedValues.time_window_start = dayjs(
        values.time_window_start,
      ).format("HH:mm");
    }
    if (values.time_window_end) {
      transformedValues.time_window_end = dayjs(values.time_window_end).format(
        "HH:mm",
      );
    }
    if (values.client_pick_up_time) {
      transformedValues.client_pick_up_time = dayjs(
        values.client_pick_up_time,
      ).format("HH:mm");
    }
    if (values.start_hour) {
      transformedValues.start_hour = dayjs.isDayjs(values.start_hour)
        ? dayjs(values.start_hour).format("HH:mm")
        : values.start_hour;
    }
    if (values.end_hour) {
      transformedValues.end_hour = dayjs.isDayjs(values.end_hour)
        ? dayjs(values.end_hour).format("HH:mm")
        : values.end_hour;
    }
    if (values.quart_id && !values.quant_id) {
      transformedValues.quant_id = values.quart_id;
    }

    // 3. Transform phone: object {countryCode, number} -> string phone_number
    if (values.phone && values.phone.number) {
      const { countryCode, number } = values.phone;
      const codeOnly = countryCode.match(/\+\d+/)?.[0] || "";
      transformedValues.phone_number = `${codeOnly}-${number}`;
      transformedValues.client_phone = `${codeOnly}-${number}`;
    }
    delete transformedValues.phone;

    // 4. Attach dynamic custom fields
    transformedValues.custom_fields = customFieldValues;

    try {
      if (initialData?.id) {
        const updatedJob = await updateJobAction(transformedValues);
        messageApi.success("Job updated successfully");
        form.resetFields();
        setCustomFieldValues({});
        onSubmit?.(updatedJob);
      } else {
        const newJob = await createJobAction(transformedValues);
        messageApi.success("Job created successfully");
        form.resetFields();
        setCustomFieldValues({});
        onSubmit?.(Array.isArray(newJob) ? newJob[0] : newJob);
      }
    } catch (e: any) {
      const error = e;
      console.error(error?.detail);
      messageApi.error(error?.detail ?? "Something went wrong");
    }
  };

  // Prefill form when initialData changes (for editing)
  useEffect(() => {
    if (initialData) {
      const customObj = initialData.custom_fields || {};
      const detailObj =
        initialData.worker_shuttle_detail ||
        initialData.pickup_delivery_detail ||
        {};

      const formValues: any = {
        ...customObj,
        ...detailObj,
        ...initialData,
      };

      if (initialData.custom_fields) {
        setCustomFieldValues(initialData.custom_fields);
      }

      if (initialData.template_type) {
        setActiveTemplate(initialData.template_type);
      }

      // Extract worker shuttle fields from root job, worker_shuttle_detail, or custom_fields
      const rawStartHour =
        initialData.start_hour ||
        initialData.worker_shuttle_detail?.start_hour ||
        initialData.custom_fields?.start_hour;

      const rawEndHour =
        initialData.end_hour ||
        initialData.worker_shuttle_detail?.end_hour ||
        initialData.custom_fields?.end_hour;

      const rawPickupType =
        initialData.pickup_type ||
        initialData.worker_shuttle_detail?.pickup_type ||
        initialData.custom_fields?.pickup_type;

      const rawQuartId =
        initialData.quart_id ||
        initialData.quant_id ||
        initialData.worker_shuttle_detail?.quart_id ||
        initialData.worker_shuttle_detail?.quant_id ||
        initialData.custom_fields?.quart_id ||
        initialData.custom_fields?.quant_id;

      // 1. Transform scheduled_date: string (YYYY-MM-DD) -> dayjs object
      if (formValues.scheduled_date) {
        formValues.scheduled_date = parseDateToDayjs(formValues.scheduled_date);
      }

      // 2. Transform time windows & pickup time: string (HH:mm) -> dayjs object
      if (formValues.time_window_start) {
        formValues.time_window_start = parseTimeToDayjs(formValues.time_window_start);
      }
      if (formValues.time_window_end) {
        formValues.time_window_end = parseTimeToDayjs(formValues.time_window_end);
      }
      if (formValues.client_pick_up_time) {
        formValues.client_pick_up_time = parseTimeToDayjs(formValues.client_pick_up_time);
      }

      if (rawStartHour) {
        formValues.start_hour = parseTimeToDayjs(rawStartHour);
      }
      if (rawEndHour) {
        formValues.end_hour = parseTimeToDayjs(rawEndHour);
      }
      if (rawPickupType) {
        formValues.pickup_type = rawPickupType;
      }
      if (rawQuartId) {
        formValues.quart_id = rawQuartId;
        formValues.quant_id = rawQuartId;
      }

      // 3. Transform phone_number: string "+1-298372138" -> object {countryCode, number}
      if (formValues.phone_number) {
        const [code, number] = formValues.phone_number.split("-");
        // Find the country with matching code to get flag
        const country = COUNTRY_CODES.find((c) => c.code === code);
        formValues.phone = {
          countryCode: country ? `${country.flag} ${code}` : `🇺🇸 ${code}`,
          number: number,
        };
        delete formValues.phone_number;
      }

      // Set all form fields with the transformed values
      form.setFieldsValue(formValues);
    }
  }, [initialData, form]);


  return (
    <Flex vertical style={{ height: "100%", overflow: "hidden" }}>
      {contextHolder}

      {/* Scrollable Form Area */}
      <Flex
        vertical
        style={{
          width: "100%",
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "0 8px",
        }}
        className="custom-scrollbar"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            scheduled_date: dayjs(),
            priority_level: "medium",
            recurrence_type: "one_time",
            payment_status: "paid",
            job_type: activeTemplate === "worker_shuttle" ? "one_way" : "pickup",
            service_duration: 5,
            reach_before_minutes: activeTemplate === "worker_shuttle" ? 10 : undefined,
          }}
        >
          {activeTemplate === "worker_shuttle" ? (
            <>
              {/* Worker Shuttle Header Row: Date & Job Type */}
              {(getFieldConfig("scheduled_date").isVisible || getFieldConfig("job_type").isVisible) && (
                <Row gutter={16}>
                  {getFieldConfig("scheduled_date").isVisible && (
                    <Col span={getFieldConfig("job_type").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={Calendar} label={getFieldConfig("scheduled_date").label} />}
                        name="scheduled_date"
                        required={getFieldConfig("scheduled_date").isRequired}
                        rules={
                          getFieldConfig("scheduled_date").isRequired
                            ? [{ required: true, message: `${getFieldConfig("scheduled_date").label} is required` }]
                            : []
                        }
                      >
                        <DatePicker format="DD-MM-YYYY" className="w-full" />
                      </Form.Item>
                    </Col>
                  )}
                  {getFieldConfig("job_type").isVisible && (
                    <Col span={getFieldConfig("scheduled_date").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={ArrowRightLeft} label={getFieldConfig("job_type").label} />}
                        name="job_type"
                        required={getFieldConfig("job_type").isRequired}
                        rules={
                          getFieldConfig("job_type").isRequired
                            ? [{ required: true, message: `${getFieldConfig("job_type").label} is required` }]
                            : []
                        }
                      >
                        <Select
                          placeholder={`Select ${getFieldConfig("job_type").label}`}
                          options={[
                            { value: "one_way", label: "One Way (Pick Up Only)" },
                            { value: "return_only", label: "Return Only (Drop Off)" },
                            { value: "round_trip", label: "Round Trip (Creates 2 Jobs)" },
                          ]}
                          onChange={(val) => {
                            if (val === "return_only") {
                              form.setFieldsValue({ reach_before_minutes: -15 });
                            } else if (val === "one_way" || val === "round_trip") {
                              form.setFieldsValue({ reach_before_minutes: 10 });
                            }
                          }}
                        />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              )}

              {/* Shift Start Time & Shift End Time */}
              {(getFieldConfig("start_hour").isVisible || getFieldConfig("end_hour").isVisible) && (
                <Row gutter={16}>
                  {getFieldConfig("start_hour").isVisible && (
                    <Col span={getFieldConfig("end_hour").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={Clock} label={getFieldConfig("start_hour").label} />}
                        name="start_hour"
                        required={getFieldConfig("start_hour").isRequired}
                        rules={
                          getFieldConfig("start_hour").isRequired
                            ? [{ required: true, message: `${getFieldConfig("start_hour").label} is required` }]
                            : []
                        }
                      >
                        <TimePicker format="HH:mm" className="w-full" needConfirm={false} />
                      </Form.Item>
                    </Col>
                  )}
                  {getFieldConfig("end_hour").isVisible && (
                    <Col span={getFieldConfig("start_hour").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={Clock} label={getFieldConfig("end_hour").label} />}
                        name="end_hour"
                        required={getFieldConfig("end_hour").isRequired}
                        rules={
                          getFieldConfig("end_hour").isRequired
                            ? [{ required: true, message: `${getFieldConfig("end_hour").label} is required` }]
                            : []
                        }
                      >
                        <TimePicker format="HH:mm" className="w-full" needConfirm={false} />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              )}

              {/* Pickup Type */}
              {getFieldConfig("pickup_type").isVisible && (
                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item
                      label={<FormLabel icon={Navigation} label={getFieldConfig("pickup_type").label} />}
                      name="pickup_type"
                      required={getFieldConfig("pickup_type").isRequired}
                      rules={
                        getFieldConfig("pickup_type").isRequired
                          ? [{ required: true, message: `${getFieldConfig("pickup_type").label} is required` }]
                          : []
                      }
                    >
                      <Select
                        placeholder={`Select ${getFieldConfig("pickup_type").label}`}
                        options={[
                          { value: "GO", label: "GO (Pick Up to Plant/Workplace)" },
                          { value: "RETURN", label: "RETURN (Plant/Workplace to Drop Off)" },
                          { value: "BOTH", label: "BOTH (Go & Return)" },
                          { value: "one_way", label: "One Way (Pick Up)" },
                          { value: "return_only", label: "Return Only (Drop Off)" },
                          { value: "round_trip", label: "Round Trip (Go & Return)" },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {/* Quart / Shift Ref ID & Assign Drivers */}
              {(() => {
                const quartCfg = getFieldConfig("quart_id").isVisible
                  ? getFieldConfig("quart_id")
                  : getFieldConfig("quant_id");
                const showQuart = quartCfg.isVisible;
                const fieldName = getFieldConfig("quart_id").isVisible ? "quart_id" : "quant_id";

                return (
                  <Row gutter={16}>
                    {showQuart && (
                      <Col span={12}>
                        <Form.Item
                          label={<FormLabel icon={Hash} label={quartCfg.label} />}
                          name={fieldName}
                          required={quartCfg.isRequired}
                          rules={
                            quartCfg.isRequired
                              ? [{ required: true, message: `${quartCfg.label} is required` }]
                              : []
                          }
                        >
                          <Input placeholder="e.g. SHIFT-101" />
                        </Form.Item>
                      </Col>
                    )}
                    <Col span={showQuart ? 12 : 24}>
                      <Form.Item label={<FormLabel icon={Users} label="Assign Driver / Team" />} name="assigned_to">
                        <Select placeholder="Select" allowClear>
                          {teams.map((team) => (
                            <Select.Option key={team.id} value={team.id}>
                              {team.name}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                );
              })()}

              {/* Reach Window */}
              {getFieldConfig("reach_before_minutes").isVisible && (
                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item
                      label={<FormLabel icon={Timer} label={getFieldConfig("reach_before_minutes").label} />}
                      name="reach_before_minutes"
                      required={getFieldConfig("reach_before_minutes").isRequired}
                      rules={
                        getFieldConfig("reach_before_minutes").isRequired
                          ? [{ required: true, message: `${getFieldConfig("reach_before_minutes").label} is required` }]
                          : []
                      }
                      tooltip="Buffer in minutes before or after target time (e.g. 10 mins for one-way go, -15 mins for return only)"
                    >
                      <Input type="number" placeholder="e.g. 10 or -15" />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {/* Client Pick Up Time & Client ID */}
              {(getFieldConfig("client_pick_up_time").isVisible || getFieldConfig("client_id").isVisible) && (
                <Row gutter={16}>
                  {getFieldConfig("client_pick_up_time").isVisible && (
                    <Col span={getFieldConfig("client_id").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={Clock} label={getFieldConfig("client_pick_up_time").label} />}
                        name="client_pick_up_time"
                        required={getFieldConfig("client_pick_up_time").isRequired}
                        rules={
                          getFieldConfig("client_pick_up_time").isRequired
                            ? [{ required: true, message: `${getFieldConfig("client_pick_up_time").label} is required` }]
                            : []
                        }
                      >
                        <TimePicker format="HH:mm" className="w-full" needConfirm={false} />
                      </Form.Item>
                    </Col>
                  )}
                  {getFieldConfig("client_id").isVisible && (
                    <Col span={getFieldConfig("client_pick_up_time").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={Fingerprint} label={getFieldConfig("client_id").label} />}
                        name="client_id"
                        required={getFieldConfig("client_id").isRequired}
                        rules={
                          getFieldConfig("client_id").isRequired
                            ? [{ required: true, message: `${getFieldConfig("client_id").label} is required` }]
                            : []
                        }
                      >
                        <Input placeholder="e.g. EMP-992" />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              )}

              {/* Pick Up Address */}
              {getFieldConfig("pick_up_address").isVisible && (
                <Form.Item
                  label={<FormLabel icon={MapPin} label={getFieldConfig("pick_up_address").label} />}
                  name="pick_up_address"
                  required={getFieldConfig("pick_up_address").isRequired}
                  rules={
                    getFieldConfig("pick_up_address").isRequired
                      ? [{ required: true, message: `${getFieldConfig("pick_up_address").label} is required` }]
                      : []
                  }
                >
                  <AddressAutocomplete
                    value={form.getFieldValue("pick_up_address")}
                    placeholder={`Type to search ${getFieldConfig("pick_up_address").label.toLowerCase()}`}
                    onChange={() => {
                      form.setFieldsValue({ pick_up_address: undefined, pick_up_location: undefined });
                    }}
                    onSelect={(addressData: AddressData) => {
                      form.setFieldsValue({
                        pick_up_address: addressData.address_formatted,
                        pick_up_location: addressData.location,
                      });
                    }}
                  />
                </Form.Item>
              )}

              {/* Drop Off Address */}
              {getFieldConfig("drop_off_address").isVisible && (
                <Form.Item
                  label={<FormLabel icon={MapPin} label={getFieldConfig("drop_off_address").label} />}
                  name="drop_off_address"
                  required={getFieldConfig("drop_off_address").isRequired}
                  rules={
                    getFieldConfig("drop_off_address").isRequired
                      ? [{ required: true, message: `${getFieldConfig("drop_off_address").label} is required` }]
                      : []
                  }
                >
                  <AddressAutocomplete
                    value={form.getFieldValue("drop_off_address")}
                    placeholder={`Type to search ${getFieldConfig("drop_off_address").label.toLowerCase()}`}
                    onChange={() => {
                      form.setFieldsValue({ drop_off_address: undefined, drop_off_location: undefined });
                    }}
                    onSelect={(addressData: AddressData) => {
                      form.setFieldsValue({
                        drop_off_address: addressData.address_formatted,
                        drop_off_location: addressData.location,
                      });
                    }}
                  />
                </Form.Item>
              )}

              {/* Client Name & Phone */}
              {(getFieldConfig("client_name").isVisible || getFieldConfig("client_phone").isVisible) && (
                <Row gutter={16}>
                  {getFieldConfig("client_name").isVisible && (
                    <Col span={getFieldConfig("client_phone").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={Building2} label={getFieldConfig("client_name").label} />}
                        name="client_name"
                        required={getFieldConfig("client_name").isRequired}
                        rules={
                          getFieldConfig("client_name").isRequired
                            ? [{ required: true, message: `${getFieldConfig("client_name").label} is required` }]
                            : []
                        }
                      >
                        <Input placeholder={getFieldConfig("client_name").label} />
                      </Form.Item>
                    </Col>
                  )}
                  {getFieldConfig("client_phone").isVisible && (
                    <Col span={getFieldConfig("client_name").isVisible ? 12 : 24}>
                      <Form.Item
                        label={<FormLabel icon={Phone} label={getFieldConfig("client_phone").label} />}
                        name="client_phone"
                        required={getFieldConfig("client_phone").isRequired}
                        rules={
                          getFieldConfig("client_phone").isRequired
                            ? [{ required: true, message: `${getFieldConfig("client_phone").label} is required` }]
                            : []
                        }
                      >
                        <Input placeholder={getFieldConfig("client_phone").label} />
                      </Form.Item>
                    </Col>
                  )}
                </Row>
              )}

              {/* Shuttle Notes */}
              {getFieldConfig("notes").isVisible && (
                <Form.Item
                  label={<FormLabel icon={FileText} label={getFieldConfig("notes").label} />}
                  name="notes"
                  required={getFieldConfig("notes").isRequired}
                  rules={
                    getFieldConfig("notes").isRequired
                      ? [{ required: true, message: `${getFieldConfig("notes").label} is required` }]
                      : []
                  }
                >
                  <Input.TextArea rows={3} placeholder="Special instructions or pickup details" />
                </Form.Item>
              )}
            </>
          ) : (
            <>
              {/* Date and Job Type */}
              <Row gutter={16}>
                {getFieldConfig("scheduled_date").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={Calendar} label={getFieldConfig("scheduled_date").label} />}
                      name="scheduled_date"
                      required={getFieldConfig("scheduled_date").isRequired}
                      rules={
                        getFieldConfig("scheduled_date").isRequired
                          ? [{ required: true, message: `${getFieldConfig("scheduled_date").label} is required` }]
                          : []
                      }
                    >
                      <DatePicker format="DD-MM-YYYY" className="w-full" />
                    </Form.Item>
                  </Col>
                )}
                {getFieldConfig("job_type").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={ArrowRightLeft} label={getFieldConfig("job_type").label} />}
                      name="job_type"
                      required={getFieldConfig("job_type").isRequired}
                      rules={
                        getFieldConfig("job_type").isRequired
                          ? [{ required: true, message: `${getFieldConfig("job_type").label} is required` }]
                          : []
                      }
                    >
                      <Select placeholder="Select" options={JOB_TYPES} />
                    </Form.Item>
                  </Col>
                )}
              </Row>

              {/* Priority and Assign Drivers */}
              <Row gutter={16}>
                {getFieldConfig("priority_level").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={Flag} label={getFieldConfig("priority_level").label} />}
                      name="priority_level"
                      required={getFieldConfig("priority_level").isRequired}
                      rules={
                        getFieldConfig("priority_level").isRequired
                          ? [{ required: true, message: `${getFieldConfig("priority_level").label} is required` }]
                          : []
                      }
                    >
                      <Select placeholder="Select" options={PRIORITY_OPTIONS} />
                    </Form.Item>
                  </Col>
                )}
                <Col span={12}>
                  <Form.Item label={<FormLabel icon={Users} label="Assign Drivers" />} name="assigned_to">
                    <Select placeholder="Select" allowClear>
                      {teams.map((team) => (
                        <Select.Option key={team.id} value={team.id}>
                          {team.name}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              {/* Address */}
              {getFieldConfig("address_formatted").isVisible && (
                <Form.Item
                  label={<FormLabel icon={MapPin} label={getFieldConfig("address_formatted").label} />}
                  name="address_formatted"
                  required={getFieldConfig("address_formatted").isRequired}
                  rules={
                    getFieldConfig("address_formatted").isRequired
                      ? [{ required: true, message: `${getFieldConfig("address_formatted").label} is required` }]
                      : []
                  }
                >
                  <AddressAutocomplete
                    value={form.getFieldValue("address_formatted")}
                    placeholder="Type to search address"
                    onChange={(value: string) => {
                      form.setFieldsValue({
                        address_formatted: undefined,
                        location: undefined,
                      });
                    }}
                    onSelect={(addressData: AddressData) => {
                      form.setFieldsValue({
                        address_formatted: addressData.address_formatted,
                        location: addressData.location,
                      });
                    }}
                  />
                </Form.Item>
              )}

              {/* Lat / Lng */}
              {getFieldConfig("location").isVisible && (
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={MapPin} label="Latitude" />}
                      name={["location", "lat"]}
                      required={getFieldConfig("location").isRequired}
                      rules={[
                        ...(getFieldConfig("location").isRequired
                          ? [{ required: true, message: "Latitude is required" }]
                          : []),
                        {
                          validator: (_, value) =>
                            value === undefined ||
                            value === null ||
                            value === "" ||
                            (!isNaN(Number(value)) &&
                              Number(value) >= -90 &&
                              Number(value) <= 90)
                              ? Promise.resolve()
                              : Promise.reject("Enter a valid latitude (-90 to 90)"),
                        },
                      ]}
                    >
                      <Input type="number" placeholder="e.g. 37.7749" step="any" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={MapPin} label="Longitude" />}
                      name={["location", "lng"]}
                      required={getFieldConfig("location").isRequired}
                      rules={[
                        ...(getFieldConfig("location").isRequired
                          ? [{ required: true, message: "Longitude is required" }]
                          : []),
                        {
                          validator: (_, value) =>
                            value === undefined ||
                            value === null ||
                            value === "" ||
                            (!isNaN(Number(value)) &&
                              Number(value) >= -180 &&
                              Number(value) <= 180)
                              ? Promise.resolve()
                              : Promise.reject(
                                  "Enter a valid longitude (-180 to 180)",
                                ),
                        },
                      ]}
                    >
                      <Input type="number" placeholder="e.g. -122.4194" step="any" />
                    </Form.Item>
                  </Col>
                </Row>
              )}

              {/* Phone Number */}
              {getFieldConfig("phone_number").isVisible && (
                <Form.Item
                  label={<FormLabel icon={Phone} label={getFieldConfig("phone_number").label} />}
                  required={getFieldConfig("phone_number").isRequired}
                  rules={
                    getFieldConfig("phone_number").isRequired
                      ? [
                          {
                            validator: (_, __) => {
                              const phoneObj = form.getFieldValue("phone");
                              if (!phoneObj || !phoneObj.number) {
                                return Promise.reject(
                                  `${getFieldConfig("phone_number").label} is required`
                                );
                              }
                              return Promise.resolve();
                            },
                          },
                        ]
                      : []
                  }
                >
                  <Row gutter={8}>
                    <Col span={8}>
                      <Form.Item
                        name={["phone", "countryCode"]}
                        noStyle
                        initialValue={`🇺🇸 +1`}
                      >
                        <Select
                          showSearch
                          className="w-full"
                          filterOption={filterCountryOptions}
                        >
                          {COUNTRY_CODES.map((item) => (
                            <Select.Option
                              key={`${item.country}-${item.code}`}
                              value={`${item.flag} ${item.code}`}
                            >
                              {item.flag} {item.code} &nbsp; {item.name}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={16}>
                      <Form.Item name={["phone", "number"]} noStyle>
                        <Input
                          type="number"
                          placeholder="8023456789"
                          maxLength={15}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form.Item>
              )}

              {/* First Name and Last Name */}
              <Row gutter={16}>
                {getFieldConfig("first_name").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={User} label={getFieldConfig("first_name").label} />}
                      name="first_name"
                      required={getFieldConfig("first_name").isRequired}
                      rules={
                        getFieldConfig("first_name").isRequired
                          ? [{ required: true, message: `${getFieldConfig("first_name").label} is required` }]
                          : []
                      }
                    >
                      <Input placeholder="First Name" />
                    </Form.Item>
                  </Col>
                )}
                {getFieldConfig("last_name").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={User} label={getFieldConfig("last_name").label} />}
                      name="last_name"
                      required={getFieldConfig("last_name").isRequired}
                      rules={
                        getFieldConfig("last_name").isRequired
                          ? [{ required: true, message: `${getFieldConfig("last_name").label} is required` }]
                          : []
                      }
                    >
                      <Input placeholder="Last Name" />
                    </Form.Item>
                  </Col>
                )}
              </Row>

              {/* Email and Business Name */}
              <Row gutter={16}>
                {getFieldConfig("email").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={Mail} label={getFieldConfig("email").label} />}
                      name="email"
                      required={getFieldConfig("email").isRequired}
                      rules={
                        getFieldConfig("email").isRequired
                          ? [{ required: true, message: `${getFieldConfig("email").label} is required` }]
                          : []
                      }
                    >
                      <Input type="email" placeholder="Email" />
                    </Form.Item>
                  </Col>
                )}
                {getFieldConfig("business_name").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={Building2} label={getFieldConfig("business_name").label} />}
                      name="business_name"
                      required={getFieldConfig("business_name").isRequired}
                      rules={
                        getFieldConfig("business_name").isRequired
                          ? [{ required: true, message: `${getFieldConfig("business_name").label} is required` }]
                          : []
                      }
                    >
                      <Input placeholder="Business Name" />
                    </Form.Item>
                  </Col>
                )}
              </Row>

              {/* Time From, To, and Duration */}
              <Row gutter={16}>
                {getFieldConfig("time_window_start").isVisible && (
                  <Col span={8}>
                    <Form.Item
                      label={<FormLabel icon={Clock} label={getFieldConfig("time_window_start").label} />}
                      name="time_window_start"
                      required={getFieldConfig("time_window_start").isRequired}
                      rules={[
                        ...(getFieldConfig("time_window_start").isRequired
                          ? [{ required: true, message: `${getFieldConfig("time_window_start").label} is required` }]
                          : []),
                        validateTimeWindowStart(form),
                      ]}
                    >
                      <TimePicker
                        needConfirm={false}
                        className="w-full"
                        format="HH:mm"
                        onChange={() => {
                          form.validateFields(["time_window_end"]);
                        }}
                      />
                    </Form.Item>
                  </Col>
                )}
                {getFieldConfig("time_window_end").isVisible && (
                  <Col span={8}>
                    <Form.Item
                      label={<FormLabel icon={Clock} label={getFieldConfig("time_window_end").label} />}
                      name="time_window_end"
                      required={getFieldConfig("time_window_end").isRequired}
                      rules={[
                        ...(getFieldConfig("time_window_end").isRequired
                          ? [{ required: true, message: `${getFieldConfig("time_window_end").label} is required` }]
                          : []),
                        validateTimeWindowEnd(form),
                      ]}
                    >
                      <TimePicker
                        needConfirm={false}
                        className="w-full"
                        format="HH:mm"
                        onChange={() => {
                          form.validateFields(["time_window_start"]);
                        }}
                      />
                    </Form.Item>
                  </Col>
                )}
                {getFieldConfig("service_duration").isVisible && (
                  <Col span={8}>
                    <Form.Item
                      label={<FormLabel icon={Timer} label={getFieldConfig("service_duration").label} />}
                      name="service_duration"
                      required={getFieldConfig("service_duration").isRequired}
                      rules={[
                        ...(getFieldConfig("service_duration").isRequired
                          ? [{ required: true, message: `${getFieldConfig("service_duration").label} is required` }]
                          : []),
                        validateJobDuration(),
                      ]}
                    >
                      <Input
                        type="number"
                        placeholder="Enter duration"
                        className="w-full"
                        addonAfter="mins"
                        max={540}
                        min={0}
                      />
                    </Form.Item>
                  </Col>
                )}
              </Row>

              {/* Customer Preferences */}
              {getFieldConfig("customer_preferences").isVisible && (
                <Form.Item
                  label={<FormLabel icon={FileText} label={getFieldConfig("customer_preferences").label} />}
                  name="customer_preferences"
                  required={getFieldConfig("customer_preferences").isRequired}
                  rules={
                    getFieldConfig("customer_preferences").isRequired
                      ? [{ required: true, message: `${getFieldConfig("customer_preferences").label} is required` }]
                      : []
                  }
                >
                  <Input.TextArea rows={3} placeholder="Type" />
                </Form.Item>
              )}

              {/* Notes */}
              {getFieldConfig("additional_notes").isVisible && (
                <Form.Item
                  label={<FormLabel icon={FileText} label={getFieldConfig("additional_notes").label} />}
                  name="additional_notes"
                  required={getFieldConfig("additional_notes").isRequired}
                  rules={
                    getFieldConfig("additional_notes").isRequired
                      ? [{ required: true, message: `${getFieldConfig("additional_notes").label} is required` }]
                      : []
                  }
                >
                  <Input.TextArea rows={3} placeholder="Type" />
                </Form.Item>
              )}

              {/* Single/Recurring and Payment Status */}
              <Row gutter={16}>
                {getFieldConfig("recurrence_type").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={Repeat} label={getFieldConfig("recurrence_type").label} />}
                      name="recurrence_type"
                      required={getFieldConfig("recurrence_type").isRequired}
                      rules={
                        getFieldConfig("recurrence_type").isRequired
                          ? [{ required: true, message: `${getFieldConfig("recurrence_type").label} is required` }]
                          : []
                      }
                    >
                      <Select placeholder="Select" options={RECURRENCE_OPTIONS} />
                    </Form.Item>
                  </Col>
                )}
                {getFieldConfig("payment_status").isVisible && (
                  <Col span={12}>
                    <Form.Item
                      label={<FormLabel icon={TagIcon} label={getFieldConfig("payment_status").label} />}
                      name="payment_status"
                      required={getFieldConfig("payment_status").isRequired}
                      rules={
                        getFieldConfig("payment_status").isRequired
                          ? [{ required: true, message: `${getFieldConfig("payment_status").label} is required` }]
                          : []
                      }
                    >
                      <Select placeholder="Select" options={PAYMENT_STATUS_OPTIONS} />
                    </Form.Item>
                  </Col>
                )}
              </Row>
            </>
          )}

          {/* Dynamic Tenant Custom Fields */}
          <DynamicCustomFieldsForm
            customFields={customFieldDefs}
            values={customFieldValues}
            onChange={(updatedVals) => setCustomFieldValues(updatedVals)}
          />
        </Form>
      </Flex>

      {/* Fixed Button at Bottom */}
      <Flex
        style={{
          paddingTop: "12px",
        }}
      >
        <Button
          type="primary"
          htmlType="submit"
          loading={isLoading}
          block
          icon={<PlusCircleOutlined />}
          onClick={() => form.submit()}
        >
          {initialData ? "Update" : "Add"}
        </Button>
      </Flex>
    </Flex>
  );
};

export default JobForm;
