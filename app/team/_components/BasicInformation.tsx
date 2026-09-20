import { useState, useEffect } from "react";
import {
  Form,
  Input,
  Select,
  TimePicker,
  Row,
  Col,
  Checkbox,
  Switch,
  Button,
  Typography,
  Space,
  Flex,
} from "antd";
import { FormInstance } from "antd/es/form";
import { CopyOutlined } from "@ant-design/icons";
import { COUNTRY_CODES } from "@/constants/country";
import {
  phoneNumberPattern,
  createTimeWindowStartValidator,
  createTimeWindowEndValidator,
} from "@/utils/form.validation";
import { ROLE_TYPE_OPTIONS } from "./teamForm.constants";
import { useDepotStore } from "@/store/depots.store";
import AddressAutocomplete, {
  AddressData,
} from "@/components/AddressAutocomplete";
import { CustomFieldDefinition, getCustomFields } from "@/apis/custom-fields.api";
import { DynamicCustomFieldsForm } from "@/components/DynamicCustomFieldsForm";

const { Text } = Typography;

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

interface BasicInformationProps {
  form: FormInstance;
  scheduleBreak: boolean;
  onScheduleBreakChange: (checked: boolean) => void;
  isDriver: boolean;
  startLocationSameAsDepot: boolean;
  onStartLocationSameAsDepotChange: (checked: boolean) => void;
  endLocationSameAsDepot: boolean;
  onEndLocationSameAsDepotChange: (checked: boolean) => void;
  startDepotId?: number;
  setStartDepotId?: (id: number) => void;
  endDepotId?: number;
  setEndDepotId?: (id: number) => void;
}

const BasicInformation = ({
  form,
  scheduleBreak,
  onScheduleBreakChange,
  isDriver,
  startLocationSameAsDepot,
  onStartLocationSameAsDepotChange,
  endLocationSameAsDepot,
  onEndLocationSameAsDepotChange,
  startDepotId,
  setStartDepotId,
  endDepotId,
  setEndDepotId,
}: BasicInformationProps) => {
  const { depots } = useDepotStore();
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const customFieldValues = form.getFieldValue("custom_fields") || {};

  useEffect(() => {
    getCustomFields("team_member")
      .then((defs) => setCustomFieldDefs(defs))
      .catch((err) => console.error("Failed to load team member custom fields", err));
  }, []);

  const depotOptions = depots.map((depot) => ({
    value: depot.id,
    label: depot.name,
  }));

  const copyMondayToAllDays = () => {
    const currentSchedules = form.getFieldValue("day_schedules") || {};
    const mon = currentSchedules.monday;
    if (!mon) return;
    const updated = { ...currentSchedules };
    ["tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].forEach((day) => {
      updated[day] = {
        enabled: mon.enabled,
        start_time: mon.start_time,
        end_time: mon.end_time,
      };
    });
    form.setFieldsValue({ day_schedules: updated });
    form.submit();
  };

  return (
    <>
      {/* Name and Role Type */}
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="Name" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="Role Type"
            name="role_type"
            rules={[{ required: true, message: "Role type is required" }]}
          >
            <Select placeholder="Select role" options={ROLE_TYPE_OPTIONS} getPopupContainer={() => document.body} />
          </Form.Item>
        </Col>
      </Row>

      {/* External Identifier and Email */}
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="External Identifier" name="external_identifier">
            <Input placeholder="External Identifier" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label="Email"
            name="email"
            rules={[{ type: "email", message: "Please enter a valid email" }]}
          >
            <Input type="email" placeholder="Email" />
          </Form.Item>
        </Col>
      </Row>

      {/* Phone Number (Optional) */}
      <Form.Item label="Phone Number (Optional)">
        <Row gutter={8}>
          <Col span={8}>
            <Form.Item
              name={["phone", "countryCode"]}
              noStyle
              initialValue={`🇺🇸 +1`}
            >
              <Select showSearch optionFilterProp="children" className="w-full" getPopupContainer={() => document.body}>
                {COUNTRY_CODES.map((item) => (
                  <Select.Option
                    key={item.code}
                    value={`${item.flag} ${item.code}`}
                  >
                    {item.flag} {item.code} &nbsp; {item.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item
              name={["phone", "number"]}
              noStyle
              rules={[phoneNumberPattern]}
            >
              <Input type="number" placeholder="Phone Number (Optional)" maxLength={15} />
            </Form.Item>
          </Col>
        </Row>
      </Form.Item>

      {/* Start and End Location */}
      {isDriver && (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={
                <span>
                  Start location{" "}
                  <Checkbox
                    checked={startLocationSameAsDepot}
                    onChange={(e) =>
                      onStartLocationSameAsDepotChange(e.target.checked)
                    }
                    style={{ marginLeft: 8 }}
                  >
                    Same as depot
                  </Checkbox>
                </span>
              }
            >
              {startLocationSameAsDepot ? (
                <Select
                  placeholder="Select depot"
                  options={depotOptions}
                  value={startDepotId}
                  onChange={(value) => setStartDepotId?.(value)}
                  disabled={!setStartDepotId}
                  getPopupContainer={() => document.body}
                />
              ) : (
                <Form.Item
                  name="start_address"
                  noStyle
                  rules={[
                    {
                      required: !startLocationSameAsDepot,
                      message: "Start location is required",
                    },
                  ]}
                >
                  <AddressAutocomplete
                    value={form.getFieldValue("start_address")}
                    placeholder="Type to search address"
                    onChange={() => {
                      form.setFieldsValue({
                        start_address: undefined,
                        start_location: undefined,
                      });
                    }}
                    onSelect={(addressData: AddressData) => {
                      form.setFieldsValue({
                        start_address: addressData.address_formatted,
                        start_location: addressData.location,
                      });
                    }}
                  />
                </Form.Item>
              )}
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label={
                <span>
                  End location{" "}
                  <Checkbox
                    checked={endLocationSameAsDepot}
                    onChange={(e) =>
                      onEndLocationSameAsDepotChange(e.target.checked)
                    }
                    style={{ marginLeft: 8 }}
                  >
                    Same as depot
                  </Checkbox>
                </span>
              }
            >
              {endLocationSameAsDepot ? (
                <Select
                  placeholder="Select depot"
                  options={depotOptions}
                  value={endDepotId}
                  onChange={(value) => setEndDepotId?.(value)}
                  disabled={!setEndDepotId}
                  getPopupContainer={() => document.body}
                />
              ) : (
                <Form.Item
                  name="end_address"
                  noStyle
                  rules={[
                    {
                      required: !endLocationSameAsDepot,
                      message: "End location is required",
                    },
                  ]}
                >
                  <AddressAutocomplete
                    value={form.getFieldValue("end_address")}
                    placeholder="Type to search address"
                    onChange={() => {
                      form.setFieldsValue({
                        end_address: undefined,
                        end_location: undefined,
                      });
                    }}
                    onSelect={(addressData: AddressData) => {
                      form.setFieldsValue({
                        end_address: addressData.address_formatted,
                        end_location: addressData.location,
                      });
                    }}
                  />
                </Form.Item>
              )}
            </Form.Item>
          </Col>
        </Row>
      )}

      {/* Hidden location fields for start */}
      <Form.Item name={["start_location", "lat"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={["start_location", "lng"]} hidden>
        <Input />
      </Form.Item>

      {/* Hidden location fields for end */}
      <Form.Item name={["end_location", "lat"]} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={["end_location", "lng"]} hidden>
        <Input />
      </Form.Item>

      {/* Driver-specific fields - only show for drivers */}
      {isDriver && (
        <>
          <Row gutter={16}>
            <Col span={24}>
              {/* Distance Limit */}
              <Form.Item label="Distance limit (km)" name="max_distance">
                <Input
                  type="number"
                  className="w-full"
                  placeholder="50"
                  min={0}
                  addonAfter="km"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Day-Wise Working Hours Schedule (Monday - Sunday) */}
          <div
            style={{
              marginTop: 8,
              marginBottom: 16,
              border: "1px solid #f0f0f0",
              borderRadius: 8,
              padding: "12px 16px",
              backgroundColor: "#fafafa",
            }}
          >
            <Flex justify="space-between" align="center" style={{ marginBottom: 12 }}>
              <div>
                <Text strong style={{ fontSize: 12, letterSpacing: "0.05em", display: "block" }}>
                  DAY-WISE WORKING HOURS (MON - SUN)
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Configure shift start and end times for each day.
                </Text>
              </div>
              <Button
                type="link"
                size="small"
                icon={<CopyOutlined />}
                onClick={copyMondayToAllDays}
                style={{ padding: 0, fontSize: 12 }}
              >
                Copy Mon to All Days
              </Button>
            </Flex>

            {DAYS.map((day) => (
              <Form.Item noStyle key={day.key} shouldUpdate>
                {() => {
                  const schedule = form.getFieldValue(["day_schedules", day.key]) || {};
                  const isEnabled = schedule.enabled !== false;

                  return (
                    <Row gutter={12} align="middle" style={{ marginBottom: 8 }}>
                      <Col span={8}>
                        <Space size="small">
                          <Form.Item
                            name={["day_schedules", day.key, "enabled"]}
                            valuePropName="checked"
                            noStyle
                            initialValue={isEnabled}
                          >
                            <Switch size="small" />
                          </Form.Item>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isEnabled ? 500 : 400,
                              color: isEnabled ? undefined : "#8c8c8c",
                            }}
                          >
                            {day.label}
                          </Text>
                        </Space>
                      </Col>

                      <Col span={16}>
                        {isEnabled ? (
                          <Row gutter={8} align="middle">
                            <Col span={11}>
                              <Form.Item
                                name={["day_schedules", day.key, "start_time"]}
                                noStyle
                              >
                                <TimePicker
                                  needConfirm={false}
                                  size="small"
                                  format="HH:mm"
                                  placeholder="Start"
                                  style={{ width: "100%" }}
                                  getPopupContainer={() => document.body}
                                />
                              </Form.Item>
                            </Col>
                            <Col span={2} style={{ textAlign: "center" }}>
                              <Text type="secondary" style={{ fontSize: 11 }}>-</Text>
                            </Col>
                            <Col span={11}>
                              <Form.Item
                                name={["day_schedules", day.key, "end_time"]}
                                noStyle
                              >
                                <TimePicker
                                  needConfirm={false}
                                  size="small"
                                  format="HH:mm"
                                  placeholder="End"
                                  style={{ width: "100%" }}
                                  getPopupContainer={() => document.body}
                                />
                              </Form.Item>
                            </Col>
                          </Row>
                        ) : (
                          <Text type="secondary" style={{ fontSize: 12, fontStyle: "italic" }}>
                            Off / Non-working
                          </Text>
                        )}
                      </Col>
                    </Row>
                  );
                }}
              </Form.Item>
            ))}
          </div>

          <Row>
            {/* Allowed Overtime */}
            <Form.Item name="allowed_overtime" valuePropName="checked">
              <Checkbox>Allowed Overtime</Checkbox>
            </Form.Item>

            {/* Schedule Break */}
            <Form.Item>
              <Checkbox
                checked={scheduleBreak}
                onChange={(e) => onScheduleBreakChange(e.target.checked)}
              >
                Schedule a break for this driver
              </Checkbox>
            </Form.Item>
          </Row>

          {/* Break Time (conditional) */}
          {scheduleBreak && (
            <Form.Item label="Break must happen between">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="break_time_start"
                    noStyle
                    rules={[
                      createTimeWindowStartValidator(
                        form,
                        "break_time_end",
                        "Break start time",
                        "Break end time"
                      ),
                    ]}
                  >
                    <TimePicker
                      needConfirm={false}
                      className="w-full"
                      format="HH:mm"
                      placeholder="Select time"
                      getPopupContainer={() => document.body}
                      onChange={() => {
                        form.validateFields(["break_time_end"]);
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="break_time_end"
                    noStyle
                    rules={[
                      createTimeWindowEndValidator(
                        form,
                        "break_time_start",
                        "Break start time",
                        "Break end time"
                      ),
                    ]}
                  >
                    <TimePicker
                      needConfirm={false}
                      className="w-full"
                      format="HH:mm"
                      placeholder="Select time"
                      getPopupContainer={() => document.body}
                      onChange={() => {
                        form.validateFields(["break_time_start"]);
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form.Item>
          )}
        </>
      )}

      <DynamicCustomFieldsForm
        customFields={customFieldDefs}
        values={customFieldValues}
        onChange={(updated) => form.setFieldsValue({ custom_fields: updated })}
      />
    </>
  );
};

export default BasicInformation;
