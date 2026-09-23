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
  form: externalForm,
}: VehicleFormProps & { form?: any }) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [internalForm] = Form.useForm();
  const form = externalForm || internalForm;
  const { createVehicleAction, updateVehicleAction, isLoading, vehicles } =
    useVehicleStore();

  const [activeSection, setActiveSection] = useState<SectionKey>("basic");
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});

  useEffect(() => {
    getCustomFields("vehicle")
      .then((defs) => setCustomFieldDefs(defs))
      .catch((err) => console.error("Failed to load vehicle custom fields", err));
  }, []);

  useEffect(() => {
    if (initialData?.custom_fields) {
      setCustomFieldValues(initialData.custom_fields);
    }
  }, [initialData]);

  // Auto-save ref
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

  const onFinish = async (values: any) => {

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
        custom_fields: customFieldValues,
      };

      if (initialData?.id) {
        await updateVehicleAction({
          ...initialData,
          ...payload,
        });
        messageApi.success("Vehicle saved successfully");
      } else {
        await createVehicleAction(payload);
        messageApi.success("Vehicle created successfully");
        form.resetFields();
        setCustomFieldValues({});
      }
      onSubmit?.();
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
    }
  };

  const menuItems = [
    { key: "basic", label: "Basic Information" },
    { key: "skillsAndConstraints", label: "Skills & Constraints" },
  ];

  return (
    <Flex style={{ height: isInline ? "auto" : "100%", overflow: isInline ? "visible" : "hidden" }}>
      {contextHolder}

      {/* Left Sidebar Menu */}
      <div
        style={{
          width: "200px",
          borderRight: "1px solid #f0f0f0",
          paddingRight: "8px",
          paddingTop: "12px",
        }}
      >
        <Menu
          mode="inline"
          selectedKeys={[activeSection]}
          onClick={({ key }) => setActiveSection(key as SectionKey)}
          items={menuItems}
          style={{
            border: "none",
            fontSize: "14px",
          }}
        />
      </div>

      {/* Right Content Area */}
      <Flex
        vertical
        style={{
          flex: 1,
          overflow: isInline ? "visible" : "hidden",
          paddingLeft: "12px",
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
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Name"
                    name="name"
                    rules={[
                      { required: true, message: "Please enter vehicle name" },
                    ]}
                  >
                    <Input placeholder="Enter vehicle name" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="License Plate" name="license_plate">
                    <Input placeholder="Enter license plate" />
                  </Form.Item>
                </Col>
              </Row>

              {/* Row 2: Make, Model */}
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Make" name="make">
                    <Input placeholder="Enter vehicle make" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Model" name="model">
                    <Input placeholder="Enter vehicle model" />
                  </Form.Item>
                </Col>
              </Row>

              {/* Row 3: Type */}
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label="Type" name="type">
                    <Select
                      showSearch
                      placeholder="Select vehicle type"
                      options={VEHICLE_TYPES}
                      allowClear
                      getPopupContainer={() => document.body}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            {/* Section 2: Skills & Constraints */}
            <div style={{ display: activeSection === "skillsAndConstraints" ? "block" : "none" }}>
              {/* Required Skills & Skill Relation */}
              <Text
                strong
                style={{
                  display: "block",
                  letterSpacing: "0.08em",
                  fontSize: 11,
                  color: "#8c8c8c",
                  marginBottom: 4,
                }}
              >
                REQUIRED SKILLS (OPTIONAL)
              </Text>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                Drivers assigned to this vehicle must possess the matching required skills.
              </Text>

              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700">Required Skills</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-gray-500 font-medium">Match Logic:</span>
                  <Form.Item name="relation" noStyle>
                    <Radio.Group size="small" buttonStyle="solid" className="shrink-0">
                      <Radio.Button value="and">All (AND)</Radio.Button>
                      <Radio.Button value="or">Any (OR)</Radio.Button>
                    </Radio.Group>
                  </Form.Item>
                </div>
              </div>

              <Form.Item name="required_skills" style={{ marginBottom: 16 }}>
                <Select
                  mode="tags"
                  style={{ width: "100%" }}
                  placeholder="Type a skill and press Enter (e.g., Heavy License, Refrigerated)"
                  options={[]}
                  tokenSeparators={[","]}
                  getPopupContainer={() => document.body}
                />
              </Form.Item>

              <Divider style={{ marginTop: 8, marginBottom: 16 }} />

              {/* Dynamic Load Constraints */}
              <Text
                strong
                style={{
                  display: "block",
                  letterSpacing: "0.08em",
                  fontSize: 11,
                  color: "#8c8c8c",
                  marginBottom: 4,
                }}
              >
                LOAD CONSTRAINTS
              </Text>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                Add one or more constraints. Orders exceeding any constraint will not be assigned to this vehicle.
              </Text>

              <Form.List name="load_constraints">
                {(fields, { add, remove }) => (
                  <>
                    {/* Table header */}
                    {fields.length > 0 && (
                      <Row gutter={8} style={{ marginBottom: 4 }}>
                        <Col flex="160px">
                          <Text type="secondary" style={{ fontSize: 12 }}>Constraint type</Text>
                        </Col>
                        <Col flex="1">
                          <Text type="secondary" style={{ fontSize: 12 }}>Max value</Text>
                        </Col>
                        <Col flex="100px">
                          <Text type="secondary" style={{ fontSize: 12 }}>Unit</Text>
                        </Col>
                        <Col flex="32px" />
                      </Row>
                    )}

                    {fields.map(({ key, name, ...restField }) => (
                      <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                        {/* Constraint type */}
                        <Col flex="160px">
                          <Form.Item
                            {...restField}
                            name={[name, "constraint_type"]}
                            style={{ margin: 0 }}
                            rules={[{ required: true, message: "Required" }]}
                          >
                            <Select
                              options={CONSTRAINT_TYPES}
                              placeholder="Type"
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
                        </Col>

                        {/* Max value */}
                        <Col flex="1">
                          <Form.Item
                            {...restField}
                            name={[name, "max_value"]}
                            style={{ margin: 0 }}
                            rules={[{ required: true, message: "Required" }]}
                          >
                            <InputNumber
                              placeholder="0"
                              min={0}
                              style={{ width: "100%" }}
                            />
                          </Form.Item>
                        </Col>

                        {/* Unit */}
                        <Col flex="100px">
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
                                  <Select options={unitOptions} placeholder="Unit" getPopupContainer={() => document.body} />
                                </Form.Item>
                              );
                            }}
                          </Form.Item>
                        </Col>

                        {/* Delete button */}
                        <Col flex="32px">
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                              remove(name);
                              triggerAutoSave();
                            }}
                            style={{ padding: 0, width: 32 }}
                          />
                        </Col>
                      </Row>
                    ))}

                    {/* Add constraint row */}
                    <Button
                      type="dashed"
                      onClick={() => {
                        add({ constraint_type: "weight", max_value: 0, unit: "kg" });
                        triggerAutoSave();
                      }}
                      icon={<PlusOutlined />}
                      block
                      style={{ marginTop: 4 }}
                    >
                      Add constraint
                    </Button>
                  </>
                )}
              </Form.List>

              <DynamicCustomFieldsForm
                customFields={customFieldDefs}
                values={customFieldValues}
                onChange={(updated) => setCustomFieldValues(updated)}
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
