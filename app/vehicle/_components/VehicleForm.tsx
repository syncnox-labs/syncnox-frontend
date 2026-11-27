"use client";
import { useEffect, useState, useRef } from "react";
import {
  Form,
  Input,
  Select,
  InputNumber,
  Button,
  Row,
  Col,
  message,
  Flex,
  Typography,
  Divider,
  Radio,
  Menu,
} from "antd";
import {
  PlusCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Vehicle, VehicleType, ConstraintType, LoadConstraint } from "@/types/vehicle.type";
import { useVehicleStore } from "@/store/vehicle.store";
import { isTextInput } from "@/utils/form.utils";
import { CustomFieldDefinition, getCustomFields } from "@/apis/custom-fields.api";
import { DynamicCustomFieldsForm } from "@/components/DynamicCustomFieldsForm";
import { AutoSaveSource, useQueuedAutoSave } from "@/hooks/useQueuedAutoSave";
import FormSection from "@/components/Settings/FormSection";
import { Package, ShieldCheck, Tag, Truck as TruckIcon } from "lucide-react";

const { Text } = Typography;

interface VehicleFormProps {
  initialData?: Vehicle | null;
  onSubmit?: () => void;
  isInline?: boolean;
  showSubmitButton?: boolean;
}

const VEHICLE_TYPES: { value: VehicleType; label: string }[] = [
  { value: "car", label: "Car" },
  { value: "van", label: "Van" },
  { value: "vehicle", label: "Vehicle"},
  { value: "bus", label: "Bus" },
  { value: "small_truck", label: "Small Truck" },
  { value: "truck", label: "Truck" },
  { value: "scooter", label: "Scooter" },
  { value: "foot", label: "Foot" },
  { value: "bike", label: "Bike" },
  { value: "mountain_bike", label: "Mountain Bike" },
];

// Maps each constraint type to its available units
const CONSTRAINT_UNITS: Record<ConstraintType, { value: string; label: string }[]> = {
  capacity: [
    { value: "seats", label: "seats" },
    { value: "passengers", label: "passengers" },
  ],
  weight: [
    { value: "kg", label: "kg" },
    { value: "lb", label: "lb" },
    { value: "t", label: "t (tonne)" },
  ],
  volume: [
    { value: "m3", label: "m³" },
    { value: "L", label: "L" },
    { value: "ft3", label: "ft³" },
  ],
  quantity: [
    { value: "units", label: "units" },
    { value: "boxes", label: "boxes" },
    { value: "items", label: "items" },
  ],
  pallets: [
    { value: "pallets", label: "pallets" },
  ],
  distance: [
    { value: "km", label: "km" },
    { value: "mi", label: "mi" },
  ],
  duration: [
    { value: "min", label: "min" },
    { value: "hr", label: "hr" },
  ],
  custom: [],
};

const CONSTRAINT_TYPES: { value: ConstraintType; label: string }[] = [
  { value: "capacity", label: "Capacity" },
  { value: "weight", label: "Weight" },
  { value: "volume", label: "Volume" },
  { value: "quantity", label: "Quantity" },
  { value: "pallets", label: "Pallets" },
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
  { value: "custom", label: "Custom" },
];

// Get default unit for a given constraint type
function getDefaultUnit(type: ConstraintType): string {
  const units = CONSTRAINT_UNITS[type];
  return units?.[0]?.value ?? "units";
}

type SectionKey = "basic" | "skillsAndConstraints";

const VehicleForm = ({
  initialData = null,
  onSubmit,
  isInline = false,
  showSubmitButton = false,
}: VehicleFormProps) => {
  const [messageApi, contextHolder] = message.useMessage();
  // Keep pending saves isolated from the next selected record.
  const [form] = Form.useForm();
  const { createVehicleAction, updateVehicleAction, isLoading, vehicles } =
    useVehicleStore();

  const [activeSection, setActiveSection] = useState<SectionKey>("basic");
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const customFieldValuesRef = useRef<Record<string, any>>({});

  useEffect(() => {
    getCustomFields("vehicle")
      .then((defs) => setCustomFieldDefs(defs))
      .catch((err) => console.error("Failed to load vehicle custom fields", err));
  }, []);

  useEffect(() => {
    if (initialData?.custom_fields) {
      customFieldValuesRef.current = initialData.custom_fields;
      setCustomFieldValues(initialData.custom_fields);
    }
  }, [initialData]);

  // Auto-save ref
  const isPrefillingRef = useRef<boolean>(true);
  const prevInitialDataIdRef = useRef<number | null>(null);

  const triggerAutoSave = () => {
    if (!initialData?.id || isPrefillingRef.current) return;
    scheduleAutoSave();
  };

  const handleValuesChange = () => {
    triggerAutoSave();
  };

  const handleBlurCapture = (e: React.FocusEvent) => {
    if (isTextInput(e.target as Element)) {
      triggerAutoSave();
    }
  };

  const defaultValues = {
    name: `Vehicle ${
      vehicles.length > 0 ? vehicles.length + 1 : 1
    }`,
    type: "car" as VehicleType,
    load_constraints: [],
    required_skills: [],
    relation: "and",
  };

  // prefill form
  useEffect(() => {
    if (initialData?.id && initialData.id === prevInitialDataIdRef.current) {
      return;
    }

    if (initialData) {
      prevInitialDataIdRef.current = initialData.id;
      isPrefillingRef.current = true;
      form.setFieldsValue({
        name: initialData.name,
        license_plate: initialData.license_plate,
        make: initialData.make,
        model: initialData.model,
        type: initialData.type,
        load_constraints: initialData.load_constraints ?? [],
        required_skills: initialData.required_skills ?? [],
        relation: initialData.relation ?? "and",
      });
      setTimeout(() => {
        isPrefillingRef.current = false;
      }, 200);
    } else {
      form.resetFields();
    }
  }, [initialData, form]);

  const persistVehicle = async (source: AutoSaveSource) => {
    const values = await form.validateFields();
    try {
      const payload = {
        ...values,
        required_skills: values.required_skills ?? [],
        relation: values.relation ?? "and",
        load_constraints: (values.load_constraints ?? []).map(
          (c: LoadConstraint) => ({
            constraint_type: c.constraint_type,
            max_value: c.max_value,
            unit: c.unit,
            label: c.label ?? null,
          })
        ),
        custom_fields: customFieldValuesRef.current,
      };

      if (initialData?.id) {
        await updateVehicleAction({
          ...initialData,
          ...payload,
        });
        if (source === "manual") {
          messageApi.success("Vehicle saved successfully");
        }
      } else {
        await createVehicleAction(payload);
        messageApi.success("Vehicle created successfully");
        form.resetFields();
        customFieldValuesRef.current = {};
        setCustomFieldValues({});
      }
      if (source === "manual") onSubmit?.();
    } catch (e: any) {
      console.error(e?.detail || e);
      let errorMessage = "Something went wrong";
      if (Array.isArray(e?.detail)) {
        errorMessage = e.detail.map((err: any) => {
          if (err.msg?.includes("not a valid email address")) {
            return "Email address is not valid";
          }
          return err.msg;
        }).join(", ");
      } else if (typeof e?.detail === "string") {
        errorMessage = e.detail;
      }
      messageApi.error(errorMessage);
      throw e;
    }
  };

  const { scheduleAutoSave, saveNow } = useQueuedAutoSave({
    enabled: Boolean(initialData?.id),
    save: persistVehicle,
  });

  const onFinish = async () => {
    try {
      if (initialData?.id) {
        await saveNow();
      } else {
        await persistVehicle("manual");
      }
    } catch {
      // The persistence function already displays the actionable error.
    }
  };

  const menuItems = [
    { key: "basic", label: "Basic Information" },
    { key: "skillsAndConstraints", label: "Skills & Constraints" },
  ];

  return (
    <Flex vertical className="responsive-entity-form" style={{ height: isInline ? "auto" : "100%", overflow: isInline ? "visible" : "hidden" }}>
      {contextHolder}

      {/* Left Sidebar Menu */}
      <label className="entity-section-select">
        Section
        <select aria-label="Form section" value={activeSection} onChange={event => setActiveSection(event.target.value as SectionKey)}>
          {menuItems.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
      <div
        className="entity-form-nav"
        style={{ boxShadow: "inset 0 -2px 0 #DCDFE4", marginBottom: 16, flexShrink: 0 }}
      >
        <Menu
          mode="horizontal"
          disabledOverflow
          selectedKeys={[activeSection]}
          onClick={({ key }) => setActiveSection(key as SectionKey)}
          items={menuItems}
          style={{ border: "none", fontSize: "14px", background: "transparent", lineHeight: "34px" }}
        />
      </div>

      {/* Right Content Area */}
      <Flex
        vertical
        className="entity-form-content"
        style={{
          flex: 1,
          overflow: isInline ? "visible" : "hidden",
          paddingLeft: 0,
          minHeight: 0,
        }}
      >
        {/* Scrollable Form Area */}
        <Flex
          vertical
          style={{
            flex: 1,
            overflowY: isInline ? "visible" : "auto",
            overflowX: "hidden",
            paddingRight: "8px",
          }}
          className="custom-scrollbar"
        >
          <Form
            id={initialData?.id ? `vehicle-${initialData.id}` : undefined}
            form={form}
            layout="vertical"
            onFinish={onFinish}
            onValuesChange={handleValuesChange}
            onBlurCapture={handleBlurCapture}
            initialValues={initialData ? undefined : defaultValues}
            autoComplete="off"
          >
            {/* Section 1: Basic Information */}
            <div style={{ display: activeSection === "basic" ? "block" : "none" }}>
              {/* Row 1: Name, License Plate */}
              <FormSection icon={Tag} title="Identity" description="How this vehicle is named in plans and on the road.">
                <Form.Item label="Name" name="name" rules={[{ required: true, message: "Please enter vehicle name" }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="License plate" name="license_plate">
                  <Input style={{ maxWidth: 250 }} />
                </Form.Item>
              </FormSection>

              <FormSection icon={TruckIcon} title="Vehicle" description="What kind of vehicle it is.">
                <Form.Item label="Type" name="type">
                  <Select
                    showSearch
                    placeholder="Select vehicle type"
                    options={VEHICLE_TYPES}
                    allowClear
                    style={{ maxWidth: 250 }}
                    getPopupContainer={() => document.body}
                  />
                </Form.Item>
                <div className="grid grid-cols-2 gap-3">
                  <Form.Item label="Make" name="make">
                    <Input />
                  </Form.Item>
                  <Form.Item label="Model" name="model">
                    <Input />
                  </Form.Item>
                </div>
              </FormSection>
            </div>

            {/* Section 2: Skills & Constraints */}
            <div style={{ display: activeSection === "skillsAndConstraints" ? "block" : "none" }}>
              {/* Required skills and how they are matched */}
              <FormSection icon={ShieldCheck} title="Required skills" description="Optional. Only drivers who have these skills can be given this vehicle.">
                <Form.Item label="Skills" name="required_skills" extra="Type a skill and press Enter. For example: Heavy license, Refrigerated.">
                  <Select
                    mode="tags"
                    style={{ width: "100%" }}
                    placeholder="Add a skill"
                    aria-label="Required skills"
                    options={[]}
                    tokenSeparators={[","]}
                    getPopupContainer={() => document.body}
                  />
                </Form.Item>
                <Form.Item label="A driver needs" name="relation" extra="This only matters when you list two or more skills.">
                  <Radio.Group buttonStyle="solid">
                    <Radio.Button value="and">All of these skills</Radio.Button>
                    <Radio.Button value="or">Any one of them</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </FormSection>

              {/* Load constraints */}
              <FormSection icon={Package} title="Load constraints" description="The most this vehicle can carry. A job that goes over any one of these is not assigned to it.">
                <Form.List name="load_constraints">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.length === 0 && (
                        <p className="m-0 mb-3 text-[13px] leading-5 text-[#626E67]">No constraints set for this vehicle.</p>
                      )}

                      {fields.length > 0 && (
                        <div className="constraint-header constraint-grid mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">
                          <span>Type</span>
                          <span>Maximum</span>
                          <span>Unit</span>
                          <span />
                        </div>
                      )}

                      {fields.map(({ key, name, ...restField }) => (
                        <div className="constraint-grid mb-2" key={key}>
                          <Form.Item
                            {...restField}
                            name={[name, "constraint_type"]}
                            style={{ margin: 0 }}
                            rules={[{ required: true, message: "Required" }]}
                          >
                            <Select
                              options={CONSTRAINT_TYPES}
                              placeholder="Type" aria-label="Constraint type"
                              getPopupContainer={() => document.body}
                              onChange={(val: ConstraintType) => {
                                // Reset unit to the first option for the new type
                                const constraints = form.getFieldValue("load_constraints");
                                constraints[name].unit = getDefaultUnit(val);
                                form.setFieldsValue({ load_constraints: constraints });
                                triggerAutoSave();
                              }}
                            />
                          </Form.Item>

                          <Form.Item
                            {...restField}
                            name={[name, "max_value"]}
                            style={{ margin: 0 }}
                            rules={[{ required: true, message: "Required" }]}
                          >
                            <InputNumber
                              placeholder="0" aria-label="Maximum load"
                              min={0}
                              style={{ width: "100%" }}
                            />
                          </Form.Item>

                          <Form.Item
                            noStyle
                            shouldUpdate={(prev, cur) =>
                              prev.load_constraints?.[name]?.constraint_type !==
                              cur.load_constraints?.[name]?.constraint_type
                            }
                          >
                            {() => {
                              const constraintType: ConstraintType =
                                form.getFieldValue(["load_constraints", name, "constraint_type"]);
                              const unitOptions = constraintType
                                ? CONSTRAINT_UNITS[constraintType]
                                : [{ value: "units", label: "units" }];

                              return (
                                <Form.Item
                                  {...restField}
                                  name={[name, "unit"]}
                                  style={{ margin: 0 }}
                                  rules={[{ required: true, message: "Required" }]}
                                >
                                  <Select options={unitOptions} placeholder="Unit" aria-label="Constraint unit" getPopupContainer={() => document.body} />
                                </Form.Item>
                              );
                            }}
                          </Form.Item>

                          <button
                            type="button"
                            aria-label="Remove this constraint"
                            data-tip="Remove"
                            className="tip inline-flex h-8 w-8 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] outline-none hover:bg-[#EAEFEC] hover:text-[#C9372C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]"
                            onClick={() => {
                              remove(name);
                              triggerAutoSave();
                            }}
                          >
                            <DeleteOutlined />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="mt-1 inline-flex h-8 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-[#0B5D3B] outline-none hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]"
                        onClick={() => {
                          add({ constraint_type: "weight", max_value: 0, unit: "kg" });
                          triggerAutoSave();
                        }}
                      >
                        <PlusOutlined /> Add constraint
                      </button>
                    </>
                  )}
                </Form.List>
              </FormSection>

              <DynamicCustomFieldsForm
                customFields={customFieldDefs}
                values={customFieldValues}
                onChange={(updated) => {
                  customFieldValuesRef.current = updated;
                  setCustomFieldValues(updated);
                  triggerAutoSave();
                }}
              />
            </div>
          </Form>
        </Flex>

        {/* Fixed Button at Bottom */}
        {(!isInline || showSubmitButton) && (
          <Flex style={{ paddingTop: 16 }}>
            <Button
              loading={isLoading}
              type="primary"
              htmlType="submit"
              block
              icon={<PlusCircleOutlined />}
              onClick={() => form.submit()}
            >
              {initialData ? "Save" : "Add Vehicle"}
            </Button>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
};

export default VehicleForm;
